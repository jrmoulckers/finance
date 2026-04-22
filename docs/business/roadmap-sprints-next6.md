# Finance App — Sprint Roadmap (Sprints 11–16)

**Document Owner:** Product Management
**Created:** 2025-07-31
**Milestone Focus:** v1.2 Finalization (Sprint 11), v2.0-alpha (Sprints 12–14), v2.0-beta (Sprints 15–16)
**Sprint Cadence:** 2-week sprints
**Status:** Planned
**Predecessor:** [Sprint Plan 6–10](sprint-plan-6-10.md) · [Sprint Plan 11–12](sprint-plan-11-12.md) · [v1.2 Release & v2.0 Roadmap](v12-release-plan-v20-roadmap.md)

---

## Executive Summary

Sprints 11–16 cover 12 weeks of development bridging the v1.2 release finalization through v2.0-alpha and into v2.0-beta. This is the most feature-rich period in the product roadmap, introducing investment tracking, custom reporting, multi-currency support, bill management, data import capabilities, and the full family/referral growth stack.

### Strategic Themes

| Sprint | Weeks | Milestone  | Theme                               |
| ------ | ----- | ---------- | ----------------------------------- |
| 11     | 21-22 | v1.2       | Premium Growth & Bank Connection UI |
| 12     | 23-24 | v2.0-alpha | Investment Tracking Foundation      |
| 13     | 25-26 | v2.0-alpha | Custom Reporting & Bill Management  |
| 14     | 27-28 | v2.0-alpha | Multi-Currency & Data Import        |
| 15     | 29-30 | v2.0-beta  | Natural Language & AI Enhancements  |
| 16     | 31-32 | v2.0-beta  | Polish, Parity, & v2.0 Release Prep |

### Milestone Mapping

- **v1.2 (Sprint 11):** Completes premium growth features — family plan management UI, referral program UI, annual subscription flow, and bank connection UI across all platforms.
- **v2.0-alpha (Sprints 12–14):** Major new capabilities — investment tracking, custom report builder, bill reminders, multi-currency, data import from competitor apps.
- **v2.0-beta (Sprints 15–16):** NLP enhancements, AI-powered features, cross-platform polish, accessibility audit, and v2.0 release candidate preparation.

---

## Platform Parity Matrix (Projected)

| Feature Area                | iOS | Android | Web | Windows | Target Sprint |
| --------------------------- | --- | ------- | --- | ------- | ------------- |
| Family plan management UI   | No  | No      | No  | No      | Sprint 11     |
| Referral program UI         | No  | No      | No  | No      | Sprint 11     |
| Annual subscription flow    | No  | No      | No  | No      | Sprint 11     |
| Bank connection UI          | No  | No      | No  | No      | Sprint 11     |
| Investment portfolio view   | No  | No      | No  | No      | Sprint 12     |
| Custom report builder       | No  | No      | No  | No      | Sprint 13     |
| Bill reminder UI            | No  | No      | No  | No      | Sprint 13     |
| Multi-currency UI           | No  | No      | No  | No      | Sprint 14     |
| Data import (CSV/Mint/YNAB) | No  | No      | No  | No      | Sprint 14     |
| NLP transaction enhancement | No  | No      | No  | No      | Sprint 15     |
| Spending forecast           | No  | No      | No  | No      | Sprint 15     |

---

## Sprint 11: "Premium Growth & Connections" (Weeks 21–22)

### Sprint Goal

Complete the premium monetization stack with family plan management, referral program, and annual subscription UIs across all platforms. Ship bank connection UI to enable the highest-conversion premium feature. Finalize v1.2 release candidate.

### Why This Sprint

- Family plan (#339) and referral program (#342) are the highest-leverage growth features — each drives organic acquisition and premium upsell
- Bank connection UI (#265) is the #1 requested premium feature and the strongest conversion driver
- Annual subscription flow (#344) directly increases LTV by reducing churn
- These features complete the v1.2 feature set for release

### Issues

| #    | Title                                               | Agent Type | Priority | Effort | Source        |
| ---- | --------------------------------------------------- | ---------- | -------- | ------ | ------------- |
| NEW  | feat(backend): Family plan subscription mgmt API    | backend    | P1       | L      | #339 backend  |
| NEW  | feat(backend): Referral tracking and reward system  | backend    | P1       | M      | #342 backend  |
| NEW  | feat(ios): Family plan management UI (#339)         | ios        | P2       | M      | #339 platform |
| NEW  | feat(android): Family plan management UI (#339)     | android    | P2       | M      | #339 platform |
| NEW  | feat(web): Family plan management UI (#339)         | web        | P2       | M      | #339 platform |
| NEW  | feat(windows): Family plan management UI (#339)     | windows    | P2       | M      | #339 platform |
| NEW  | feat(ios): Referral program UI (#342)               | ios        | P2       | S      | #342 platform |
| NEW  | feat(android): Referral program UI (#342)           | android    | P2       | S      | #342 platform |
| NEW  | feat(web): Referral program UI (#342)               | web        | P2       | S      | #342 platform |
| NEW  | feat(windows): Referral program UI (#342)           | windows    | P2       | S      | #342 platform |
| NEW  | feat(ios): Annual subscription discount flow (#344) | ios        | P2       | S      | #344 platform |
| NEW  | feat(android): Annual subscription flow (#344)      | android    | P2       | S      | #344 platform |
| NEW  | feat(web): Annual subscription discount flow (#344) | web        | P2       | S      | #344 platform |
| NEW  | feat(windows): Annual subscription flow (#344)      | windows    | P2       | S      | #344 platform |
| NEW  | feat(ios): Bank connection UI (#265)                | ios        | P1       | L      | #265 platform |
| NEW  | feat(android): Bank connection UI (#265)            | android    | P1       | L      | #265 platform |
| NEW  | feat(web): Bank connection UI (#265)                | web        | P1       | L      | #265 platform |
| NEW  | feat(windows): Bank connection UI (#265)            | windows    | P1       | L      | #265 platform |
| #813 | mktg: Bank connection trust-building campaign       | marketing  | P1       | M      | Sprint 10     |
| NEW  | mktg: Family plan launch campaign                   | marketing  | P2       | M      | NEW           |

**Total: 20 items (18 engineering + 2 business)**

### Engineering Breakdown by Agent

- **Backend Agent:** Family plan subscription management API (household CRUD, member invites, billing proration), Referral tracking and reward system (referral links, attribution, reward fulfillment)
- **KMP/Shared Agent:** Family plan shared models and business logic, Referral tracking shared models, Bank connection shared models (from #265)
- **iOS Agent:** Family plan management UI, Referral program UI, Annual subscription flow, Bank connection UI
- **Android Agent:** Family plan management UI, Referral program UI, Annual subscription flow, Bank connection UI
- **Web Agent:** Family plan management UI, Referral program UI, Annual subscription flow, Bank connection UI
- **Windows Agent:** Family plan management UI, Referral program UI, Annual subscription flow, Bank connection UI

### Dependencies

```
#337 (Sprint 7, freemium gating) --> Family plan UI (tier system must exist)
#338 (Sprint 7, IAP infra) --> Annual subscription flow (billing infra must exist)
#265 (bank connection API) --> Bank connection UI (API must be ready)
Family plan backend API --> Family plan platform UIs
Referral backend API --> Referral platform UIs
```

### Success Criteria

- [ ] Family plan management screens functional on all 4 platforms (invite, manage, remove members)
- [ ] Referral program generates unique links, tracks attribution, and awards rewards on all platforms
- [ ] Annual subscription discount shown alongside monthly, with savings displayed
- [ ] Bank connection UI allows account linking, viewing connected accounts, and disconnecting
- [ ] v1.2 release candidate passes all integration tests
- [ ] Family plan launch marketing campaign drafted and scheduled

---

## Sprint 12: "Investment Tracking Foundation" (Weeks 23–24)

### Sprint Goal

Build the investment tracking infrastructure — backend integration with financial data providers, KMP shared portfolio models, and platform-specific portfolio view UIs. This is the #1 most-requested v2.0 feature and the strongest premium upsell driver.

### Why This Sprint

- Investment tracking is the top-ranked v2.0 feature by business impact (see v12-release-plan-v20-roadmap.md)
- Backend provider integration must start early due to API onboarding lead times
- KMP models must be ready before any platform can build UI
- Revenue justification: enables price tier increase to $6.99/month or new "Pro" tier

### Issues

| #   | Title                                                | Agent Type | Priority | Effort | Source       |
| --- | ---------------------------------------------------- | ---------- | -------- | ------ | ------------ |
| NEW | feat(backend): Investment data provider integration  | backend    | P1       | XL     | v2.0 roadmap |
| NEW | feat(kmp): Investment portfolio shared models        | kmp        | P1       | L      | v2.0 roadmap |
| NEW | feat(ios): Investment tracking portfolio view        | ios        | P2       | L      | v2.0 roadmap |
| NEW | feat(android): Investment tracking portfolio view    | android    | P2       | L      | v2.0 roadmap |
| NEW | feat(web): Investment tracking portfolio view        | web        | P2       | L      | v2.0 roadmap |
| NEW | feat(windows): Investment tracking portfolio view    | windows    | P2       | L      | v2.0 roadmap |
| NEW | task(business): Investment feature business analysis | product    | P1       | M      | NEW          |
| NEW | mktg: Sprint 11 — Investment feature teaser campaign | marketing  | P2       | S      | NEW          |

**Total: 8 items (6 engineering + 2 business)**

### Engineering Breakdown by Agent

- **Backend Agent:** Investment data provider integration — Plaid Investments API or alternative provider, portfolio sync endpoint, holdings and transactions models, historical price data caching
- **KMP/Shared Agent:** Investment portfolio shared models — Account types (brokerage, retirement, crypto), Holding model (ticker, shares, cost basis, current value), portfolio performance calculations (total return, daily change, allocation %)
- **iOS Agent:** Portfolio view — holdings list with real-time quotes, allocation pie chart, performance graph, account summary
- **Android Agent:** Portfolio view — Material Design 3 portfolio components, performance charts, holdings detail
- **Web Agent:** Portfolio view — responsive portfolio dashboard, interactive charts, holdings table with sorting/filtering
- **Windows Agent:** Portfolio view — WinUI 3 portfolio components, charts integration, holdings grid

### Dependencies

```
Investment backend API --> KMP shared models --> Platform UIs
#265 (bank connection) --> Investment provider (may share Plaid infrastructure)
#337 (freemium gating) --> Investment is premium-only feature
```

### Success Criteria

- [ ] Investment data provider API integrated with at least read-only portfolio data
- [ ] KMP shared models support brokerage, retirement, and crypto account types
- [ ] Portfolio view renders on all 4 platforms with holdings, allocation, and performance
- [ ] Manual investment entry supported as fallback when provider connection unavailable
- [ ] Investment feature business case validated with market research

---

## Sprint 13: "Reports & Bill Management" (Weeks 25–26)

### Sprint Goal

Deliver the custom report builder (#303) across all platforms and build bill reminder / recurring transaction management. Both features serve power users and strengthen the premium value proposition.

### Why This Sprint

- Custom report builder (#303) is ranked #6 in v2.0 priority matrix with 1.08 priority score
- Bill reminders address a top user pain point: forgetting recurring payments
- Report generation service enables scheduled email reports (premium feature)
- Bill detection from transaction patterns leverages existing AI categorization (Sprint 9)

### Issues

| #    | Title                                                   | Agent Type | Priority | Effort | Source        |
| ---- | ------------------------------------------------------- | ---------- | -------- | ------ | ------------- |
| NEW  | feat(backend): Report generation service                | backend    | P1       | L      | #303 backend  |
| NEW  | feat(backend): Bill detection from transaction patterns | backend    | P2       | M      | NEW           |
| #303 | [V2] Custom report builder                              | kmp        | P2       | L      | V2 backlog    |
| NEW  | feat(ios): Custom report builder UI (#303)              | ios        | P2       | L      | #303 platform |
| NEW  | feat(android): Custom report builder UI (#303)          | android    | P2       | L      | #303 platform |
| NEW  | feat(web): Custom report builder UI (#303)              | web        | P2       | L      | #303 platform |
| NEW  | feat(windows): Custom report builder UI (#303)          | windows    | P2       | L      | #303 platform |
| NEW  | feat(kmp): Bill reminder and recurring txn management   | kmp        | P2       | M      | NEW           |
| NEW  | feat(ios): Bill reminder UI                             | ios        | P2       | M      | NEW           |
| NEW  | feat(android): Bill reminder UI                         | android    | P2       | M      | NEW           |
| NEW  | feat(web): Bill reminder UI                             | web        | P2       | M      | NEW           |
| NEW  | feat(windows): Bill reminder UI                         | windows    | P2       | M      | NEW           |
| NEW  | mktg: Sprint 12 — Report builder & bill mgmt campaign   | marketing  | P2       | S      | NEW           |

**Total: 13 items (11 engineering + 1 existing + 1 business)**

### Engineering Breakdown by Agent

- **Backend Agent:** Report generation service (date-range queries, category filters, chart data, PDF/CSV export, scheduled email delivery), Bill detection (pattern matching on recurring transactions, subscription identification, due date prediction)
- **KMP/Shared Agent:** #303 Custom report builder shared logic (report definitions, filter models, chart data models), Bill reminder shared models (recurring transaction rules, reminder scheduling, bill calendar)
- **iOS Agent:** Custom report builder UI (template picker, date range selector, category filters, chart rendering, export), Bill reminder UI (bill list, calendar view, notification preferences)
- **Android Agent:** Custom report builder UI, Bill reminder UI (same feature set, Material Design 3)
- **Web Agent:** Custom report builder UI (responsive, interactive chart library), Bill reminder UI (calendar component)
- **Windows Agent:** Custom report builder UI, Bill reminder UI (WinUI 3 components)

### Dependencies

```
Report generation backend --> KMP report models --> Platform report UIs
Bill detection backend --> KMP bill models --> Platform bill UIs
#1047 (recurring transaction processing) --> Bill detection (builds on existing recurring logic)
Sprint 9 AI categorization --> Bill detection (uses category patterns)
```

### Success Criteria

- [ ] Custom report builder generates date-filtered, category-filtered reports on all platforms
- [ ] PDF and CSV export functional from report builder
- [ ] Bill detection identifies at least 80% of recurring transactions from history
- [ ] Bill reminder UI shows upcoming bills with calendar view
- [ ] Push notifications fire for upcoming bill due dates
- [ ] Report builder marketing assets created

---

## Sprint 14: "Multi-Currency & Data Import" (Weeks 27–28)

### Sprint Goal

Add multi-currency support with live exchange rates and build data import capabilities from other finance apps (CSV generic, Mint export, YNAB export). These features remove the two largest barriers to adoption for international users and users switching from competitors.

### Why This Sprint

- Multi-currency is the #1 blocker for international expansion (see international-expansion-analysis.md)
- Data import eliminates the highest-friction onboarding step: re-entering transaction history
- Both features strengthen the moat against competitors and reduce switching costs TO our app
- Exchange rate service is a shared backend capability used by multiple features

### Issues

| #   | Title                                                   | Agent Type | Priority | Effort | Source |
| --- | ------------------------------------------------------- | ---------- | -------- | ------ | ------ |
| NEW | feat(backend): Multi-currency exchange rate service     | backend    | P1       | L      | NEW    |
| NEW | feat(kmp): Multi-currency support shared models         | kmp        | P1       | L      | NEW    |
| NEW | feat(ios): Multi-currency support UI                    | ios        | P2       | M      | NEW    |
| NEW | feat(android): Multi-currency support UI                | android    | P2       | M      | NEW    |
| NEW | feat(web): Multi-currency support UI                    | web        | P2       | M      | NEW    |
| NEW | feat(windows): Multi-currency support UI                | windows    | P2       | M      | NEW    |
| NEW | feat(kmp): Data import engine (CSV, Mint, YNAB)         | kmp        | P1       | L      | NEW    |
| NEW | feat(ios): Data import UI                               | ios        | P2       | M      | NEW    |
| NEW | feat(android): Data import UI                           | android    | P2       | M      | NEW    |
| NEW | feat(web): Data import UI                               | web        | P2       | M      | NEW    |
| NEW | feat(windows): Data import UI                           | windows    | P2       | M      | NEW    |
| NEW | task(business): Pricing update analysis for family plan | product    | P2       | S      | NEW    |
| NEW | mktg: Sprint 13 — Multi-currency & import campaign      | marketing  | P2       | S      | NEW    |

**Total: 13 items (11 engineering + 2 business)**

### Engineering Breakdown by Agent

- **Backend Agent:** Multi-currency exchange rate service (rate provider integration, daily rate caching, historical rates for conversion, Edge Function for rate queries)
- **KMP/Shared Agent:** Multi-currency models (currency codes, account currency, transaction currency, conversion at point-of-entry, display currency preference), Data import engine (CSV parser, Mint format adapter, YNAB format adapter, category mapping, duplicate detection, preview before import)
- **iOS Agent:** Multi-currency UI (currency picker, converted amounts display, base currency settings), Data import UI (file picker, format detection, preview, import progress)
- **Android Agent:** Multi-currency UI, Data import UI (same features, Material Design 3)
- **Web Agent:** Multi-currency UI, Data import UI (drag-and-drop file upload, preview table)
- **Windows Agent:** Multi-currency UI, Data import UI (WinUI 3 file picker, preview)

### Dependencies

```
Exchange rate backend --> KMP multi-currency models --> Platform UIs
Data import KMP engine --> Platform import UIs
#264 (i18n framework, Sprint 8) --> Multi-currency (locale-aware formatting)
```

### Success Criteria

- [ ] Exchange rate service provides daily rates for top 30 currencies
- [ ] Transactions can be entered and displayed in any supported currency
- [ ] Account-level base currency with automatic conversion for reporting
- [ ] CSV import handles generic format with column mapping UI
- [ ] Mint and YNAB export files import with 95%+ field mapping accuracy
- [ ] Duplicate detection prevents re-importing existing transactions
- [ ] Family plan pricing analysis complete with recommendations

---

## Sprint 15: "NLP & Smart Features" (Weeks 29–30)

### Sprint Goal

Enhance the natural language transaction input (#237/#322) with improved parsing and multi-language support. Extend the AI layer with spending forecast confidence intervals (#328). Focus on intelligence features that differentiate from competitors.

### Why This Sprint

- NLP transaction input (#322) was built in Sprint 9 but needs enhancement for accuracy and language coverage
- Spending forecast (#328, currently stale) is a high-value premium feature
- AI features are the strongest retention drivers and premium conversion justification
- Sprint 15 is the last feature sprint before v2.0-beta polish

### Issues

| #     | Title                                                      | Agent Type    | Priority | Effort | Source        |
| ----- | ---------------------------------------------------------- | ------------- | -------- | ------ | ------------- |
| #322  | [Stage 10] Natural language transaction input              | kmp           | P2       | M      | Stage 10      |
| #328  | [Stage 10] Spending forecast with confidence intervals     | kmp + backend | P2       | M      | Stage 10      |
| NEW   | feat(ios): NLP transaction input enhancement (#322)        | ios           | P2       | S      | #322 platform |
| NEW   | feat(android): NLP transaction input enhancement (#322)    | android       | P2       | S      | #322 platform |
| NEW   | feat(web): NLP transaction input enhancement (#322)        | web           | P2       | S      | #322 platform |
| NEW   | feat(windows): NLP transaction input enhancement (#322)    | windows       | P2       | S      | #322 platform |
| #323  | [Stage 10] Anomaly detection for unusual transactions      | kmp + backend | P2       | M      | Stage 10      |
| #77   | [Phase 8] Full Accessibility Audit (WCAG 2.2 AA)           | qa + all      | P1       | L      | Phase 8       |
| NEW   | mktg: Sprint 14 — AI features & smart insights campaign    | marketing     | P2       | S      | NEW           |
| #1019 | task(product): Sprint 11 — Stage 12 feature specifications | product       | P2       | M      | Existing      |

**Total: 10 items (7 engineering + 1 QA + 2 business)**

### Engineering Breakdown by Agent

- **KMP/Shared Agent:** #322 NLP enhancements (multi-language parsing, merchant fuzzy matching, amount extraction improvements, date inference), #328 Spending forecast (ML model for end-of-month prediction with confidence bands, historical pattern analysis), #323 Anomaly detection (statistical outlier detection, category-based thresholds)
- **iOS Agent:** NLP input UI enhancements (inline parsing preview, suggestion chips, auto-complete)
- **Android Agent:** NLP input UI enhancements (Material Design 3 input field, parsing feedback)
- **Web Agent:** NLP input UI enhancements (typeahead, parsed field highlighting)
- **Windows Agent:** NLP input UI enhancements (WinUI 3 text input with parsing overlay)
- **QA/All Agents:** #77 Accessibility audit across all platforms (WCAG 2.2 AA compliance)
- **Backend Agent:** #328 forecast data aggregation endpoint, #323 anomaly threshold configuration

### Dependencies

```
#322 KMP NLP engine (Sprint 9 base) --> Platform NLP UI enhancements
Sprint 9 AI categorization --> #328 forecast (needs category history)
Sprint 9 AI categorization --> #323 anomaly detection (needs spending patterns)
```

### Success Criteria

- [ ] NLP parsing accuracy improved to 90%+ for English, 80%+ for top 5 languages
- [ ] Spending forecast shows end-of-month predicted balance with confidence intervals
- [ ] Anomaly detection flags unusual transactions with explanations
- [ ] Accessibility audit completed with all P0 issues resolved
- [ ] AI features marketing campaign positions privacy-first intelligence

---

## Sprint 16: "Polish, Parity, & v2.0 Prep" (Weeks 31–32)

### Sprint Goal

Cross-platform polish, feature parity verification, performance optimization, and v2.0 release preparation. This sprint focuses on quality over new features — every platform should reach functional parity for all v2.0 features.

### Why This Sprint

- Final sprint before v2.0-beta release requires comprehensive polish
- Platform parity gaps from parallel development must be closed
- Performance budgets must be met across all platforms
- v2.0 release artifacts, notes, and marketing must be prepared

### Issues

| #     | Title                                                   | Agent Type    | Priority | Effort | Source   |
| ----- | ------------------------------------------------------- | ------------- | -------- | ------ | -------- |
| NEW   | task(all): v2.0 cross-platform feature parity audit     | product + qa  | P1       | M      | NEW      |
| NEW   | task(devops): v2.0 release pipeline and artifact prep   | devops        | P1       | M      | NEW      |
| NEW   | feat(all): v2.0 performance optimization pass           | all platforms | P1       | L      | NEW      |
| NEW   | mktg: Sprint 15 — v2.0 launch campaign preparation      | marketing     | P1       | L      | NEW      |
| NEW   | task(product): v2.0 go/no-go checklist and release plan | product       | P1       | M      | NEW      |
| #1020 | task(product): Sprint 12 — V2 feature prioritization    | product       | P2       | M      | Existing |
| #1021 | task(product): Sprint 13 — Post-launch roadmap          | product       | P2       | M      | Existing |

**Total: 7 items (3 engineering + 2 business + 2 product)**

### Engineering Breakdown by Agent

- **All Platform Agents:** Performance optimization pass — measure against performance.budget.json, optimize critical rendering paths, reduce bundle sizes, improve sync performance
- **DevOps Agent:** Release pipeline — automated build for all platforms, store submission artifacts, release notes generation, staged rollout configuration
- **QA Agent:** Feature parity audit — verify all Sprint 11–15 features work identically across iOS, Android, Web, and Windows
- **Product:** Go/no-go checklist, release plan, stakeholder coordination

### Success Criteria

- [ ] All v2.0 features at functional parity across all 4 platforms
- [ ] Performance budgets met (startup < 2s, sync < 3s, no jank)
- [ ] v2.0 release candidate built and passing all CI checks
- [ ] Release notes drafted and reviewed
- [ ] App store submission artifacts prepared for all platforms
- [ ] v2.0 launch marketing campaign finalized

---

## Cross-Sprint Dependency Map

```
Sprint 11 (Premium Growth)
├── Family plan backend API --> Family plan UIs (all platforms)
├── Referral backend --> Referral UIs (all platforms)
├── Bank connection API (#265) --> Bank connection UIs (all platforms)
└── Annual subscription backend --> Annual flow UIs

Sprint 12 (Investment Tracking)
├── Investment backend API --> KMP shared models --> Platform portfolio UIs
├── Depends on: #265 bank connection (shared Plaid infra)
└── Depends on: #337 freemium gating (premium-only)

Sprint 13 (Reports & Bills)
├── Report generation backend --> KMP report models --> Platform report UIs
├── Bill detection backend --> KMP bill models --> Platform bill UIs
├── Depends on: #1047 recurring transaction processing
└── Depends on: Sprint 9 AI categorization

Sprint 14 (Multi-Currency & Import)
├── Exchange rate backend --> KMP currency models --> Platform currency UIs
├── Data import KMP engine --> Platform import UIs
└── Depends on: #264 i18n framework (Sprint 8)

Sprint 15 (NLP & AI)
├── KMP NLP enhancements --> Platform NLP UIs
├── Depends on: Sprint 9 NLP base (#322)
└── Depends on: Sprint 9 AI categorization

Sprint 16 (Polish)
├── Depends on: All Sprint 11-15 features complete
├── Performance optimization --> Release candidate
└── Go/no-go review --> v2.0 release decision
```

---

## Agent Workload Distribution

| Agent Type | S11 | S12 | S13 | S14 | S15 | S16 | Total |
| ---------- | --- | --- | --- | --- | --- | --- | ----- |
| Backend    | 2   | 1   | 2   | 1   | 1   | 0   | 7     |
| KMP/Shared | 0   | 1   | 2   | 2   | 3   | 0   | 8     |
| iOS        | 4   | 1   | 2   | 2   | 1   | 1   | 11    |
| Android    | 4   | 1   | 2   | 2   | 1   | 1   | 11    |
| Web        | 4   | 1   | 2   | 2   | 1   | 1   | 11    |
| Windows    | 4   | 1   | 2   | 2   | 1   | 1   | 11    |
| DevOps     | 0   | 0   | 0   | 0   | 0   | 1   | 1     |
| Marketing  | 2   | 1   | 1   | 1   | 1   | 1   | 7     |
| Product    | 0   | 1   | 0   | 1   | 1   | 2   | 5     |
| QA         | 0   | 0   | 0   | 0   | 1   | 1   | 2     |

---

## Feature Priority per Platform

### iOS Priorities (Sprints 11–16)

1. **S11:** Bank connection UI (P1), Family plan mgmt (P2), Referral UI (P2), Annual flow (P2)
2. **S12:** Investment portfolio view (P2)
3. **S13:** Custom report builder (P2), Bill reminder UI (P2)
4. **S14:** Multi-currency UI (P2), Data import UI (P2)
5. **S15:** NLP input enhancement (P2)
6. **S16:** Performance optimization, parity audit

### Android Priorities (Sprints 11–16)

1. **S11:** Bank connection UI (P1), Family plan mgmt (P2), Referral UI (P2), Annual flow (P2)
2. **S12:** Investment portfolio view (P2)
3. **S13:** Custom report builder (P2), Bill reminder UI (P2)
4. **S14:** Multi-currency UI (P2), Data import UI (P2)
5. **S15:** NLP input enhancement (P2)
6. **S16:** Performance optimization, parity audit

### Web Priorities (Sprints 11–16)

1. **S11:** Bank connection UI (P1), Family plan mgmt (P2), Referral UI (P2), Annual flow (P2)
2. **S12:** Investment portfolio view (P2)
3. **S13:** Custom report builder (P2), Bill reminder UI (P2)
4. **S14:** Multi-currency UI (P2), Data import UI (P2)
5. **S15:** NLP input enhancement (P2)
6. **S16:** Performance optimization, parity audit

### Windows Priorities (Sprints 11–16)

1. **S11:** Bank connection UI (P1), Family plan mgmt (P2), Referral UI (P2), Annual flow (P2)
2. **S12:** Investment portfolio view (P2)
3. **S13:** Custom report builder (P2), Bill reminder UI (P2)
4. **S14:** Multi-currency UI (P2), Data import UI (P2)
5. **S15:** NLP input enhancement (P2)
6. **S16:** Performance optimization, parity audit

---

## Shared Infrastructure Priorities (KMP, Backend, DevOps)

### KMP Shared Layer

| Sprint | Deliverable                               | Priority |
| ------ | ----------------------------------------- | -------- |
| 12     | Investment portfolio shared models        | P1       |
| 13     | Report builder shared logic, Bill models  | P2       |
| 14     | Multi-currency models, Data import engine | P1       |
| 15     | NLP enhancements, Forecast model, Anomaly | P2       |

### Backend Services

| Sprint | Deliverable                               | Priority |
| ------ | ----------------------------------------- | -------- |
| 11     | Family plan API, Referral tracking API    | P1       |
| 12     | Investment data provider integration      | P1       |
| 13     | Report generation service, Bill detection | P1/P2    |
| 14     | Multi-currency exchange rate service      | P1       |
| 15     | Forecast endpoint, Anomaly configuration  | P2       |

### DevOps / CI-CD

| Sprint | Deliverable                                | Priority |
| ------ | ------------------------------------------ | -------- |
| 16     | v2.0 release pipeline, artifact automation | P1       |

---

## Business / Marketing / Design Priorities

| Sprint | Deliverable                               | Priority | Agent     |
| ------ | ----------------------------------------- | -------- | --------- |
| 11     | Bank connection trust campaign (#813)     | P1       | Marketing |
| 11     | Family plan launch campaign               | P2       | Marketing |
| 12     | Investment feature business analysis      | P1       | Product   |
| 12     | Investment feature teaser campaign        | P2       | Marketing |
| 13     | Report builder & bill management campaign | P2       | Marketing |
| 14     | Pricing update analysis for family plan   | P2       | Product   |
| 14     | Multi-currency & import campaign          | P2       | Marketing |
| 15     | AI features & smart insights campaign     | P2       | Marketing |
| 15     | Stage 12 feature specifications (#1019)   | P2       | Product   |
| 16     | v2.0 launch campaign preparation          | P1       | Marketing |
| 16     | v2.0 go/no-go checklist and release plan  | P1       | Product   |
| 16     | V2 feature prioritization (#1020)         | P2       | Product   |
| 16     | Post-launch roadmap (#1021)               | P2       | Product   |

---

## Risk Register

| Risk                                                | Sprint | Impact | Mitigation                                                |
| --------------------------------------------------- | ------ | ------ | --------------------------------------------------------- |
| Investment provider API onboarding delays           | 12     | High   | Start vendor outreach in Sprint 11; manual entry fallback |
| Multi-currency exchange rate provider reliability   | 14     | Medium | Dual-provider strategy; cache rates for 24h offline       |
| Data import format edge cases (corrupted files)     | 14     | Medium | Strict validation; preview before commit; rollback        |
| NLP accuracy below 90% target                       | 15     | Medium | Ship as "beta"; user correction feedback loop             |
| Platform parity gaps too large for Sprint 16 polish | 16     | High   | Track parity matrix weekly from Sprint 11                 |
| v2.0 scope creep from Sprint 11-15 carryover        | 16     | Medium | Strict sprint boundaries; descoped items go to v2.1       |
| Family plan billing edge cases (proration, dunning) | 11     | Medium | Lean on Stripe/store subscription management              |

---

## Go/No-Go Checklist (v2.0 Release — Sprint 16 End)

- [ ] All P0/P1 issues from Sprints 11–16 resolved
- [ ] Security review completed for investment tracking, bank connections, and multi-currency
- [ ] Accessibility audit (#77) passed (WCAG 2.2 AA)
- [ ] Platform parity matrix fully green
- [ ] Performance budgets met on all platforms
- [ ] Release notes drafted covering all v2.0 features
- [ ] App store listings updated with v2.0 features and screenshots
- [ ] Marketing launch campaign scheduled and assets approved
- [ ] Rollback plan documented and tested
- [ ] Stakeholder sign-off from all roles

---

## Sprint Metrics Targets

| Metric                    | S11   | S12   | S13   | S14   | S15   | S16   |
| ------------------------- | ----- | ----- | ----- | ----- | ----- | ----- |
| Sprint completion rate    | 80%+  | 80%+  | 80%+  | 80%+  | 85%+  | 90%+  |
| Issues closed             | 16+   | 6+    | 10+   | 10+   | 8+    | 6+    |
| P0 blockers at sprint end | 0     | 0     | 0     | 0     | 0     | 0     |
| Platform parity %         | 70%   | 75%   | 80%   | 85%   | 90%   | 100%  |
| Premium conversion rate   | 6%+   | 7%+   | 7%+   | 8%+   | 8%+   | 8%+   |
| Crash-free rate           | 99.5% | 99.5% | 99.5% | 99.5% | 99.7% | 99.9% |

---

_This roadmap is a living document. Sprint scope adjusts based on preceding sprint velocity, v1.2 adoption data, and business review outcomes (#832, #833). v2.0 timeline is aspirational until Sprint 12 investment feature validation is complete._
