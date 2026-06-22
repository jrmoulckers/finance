# V2 Feature Prioritization Matrix

**Sprint:** S2 — V2 Feature Prioritization
**Priority:** P2 — Medium
**Status:** Complete
**Document Owner:** Product Management
**Date:** 2025-07-31

---

## Executive Summary

This document ranks all remaining open V2 issues (#293, #295, #299, #300, #301,
#303, #304, #305) by business impact and implementation effort, producing a
prioritized execution order for the v2.0 development cycle. Two V2 issues (#294
Native Platform Integrations and #302 Offline-first Data Migration) were
completed in earlier sprints and are excluded.

### Scoring Methodology

Each feature is scored on two dimensions:

- **Impact (1-5):** Composite of user value, revenue potential, retention
  effect, and competitive differentiation
- **Effort (1-5):** Composite of engineering complexity, cross-platform scope,
  backend requirements, and dependency count

**Priority Score** = Impact / Effort (higher is better)

---

## Impact Scoring Criteria

| Score | User Value       | Revenue Potential   | Retention Effect | Competitive Edge  |
| ----- | ---------------- | ------------------- | ---------------- | ----------------- |
| 5     | Core need, daily | Direct revenue gate | Churn prevention | No competitor has |
| 4     | Frequent use     | Premium upsell      | Strong retention | Few competitors   |
| 3     | Weekly use       | Indirect revenue    | Moderate         | Parity feature    |
| 2     | Occasional use   | Minimal revenue     | Low retention    | Many have this    |
| 1     | Nice-to-have     | No revenue impact   | Negligible       | Table stakes      |

## Effort Scoring Criteria

| Score | Engineering | Cross-Platform   | Backend          | Dependencies    |
| ----- | ----------- | ---------------- | ---------------- | --------------- |
| 5     | 12+ weeks   | All 4 platforms  | New infra needed | 3+ dependencies |
| 4     | 8-12 weeks  | 3 platforms      | Significant API  | 2 dependencies  |
| 3     | 4-8 weeks   | 2 platforms      | Moderate API     | 1 dependency    |
| 2     | 2-4 weeks   | 1 platform + KMP | Minor API        | No dependencies |
| 1     | < 2 weeks   | KMP only         | None             | No dependencies |

---

## Feature Scoring Matrix

### #301 — Smart Receipt Scanning and OCR

| Dimension          | Score    | Rationale                                            |
| ------------------ | -------- | ---------------------------------------------------- |
| User Value         | 5        | Eliminates manual entry — the top user pain point    |
| Revenue Potential  | 4        | Premium feature, strong conversion driver            |
| Retention Effect   | 5        | Daily engagement hook, reduces entry friction        |
| Competitive Edge   | 3        | Monarch and Copilot have this, but ours is on-device |
| **Impact Total**   | **4.25** | Weighted average                                     |
| Engineering        | 4        | OCR per platform, parsing heuristics, image storage  |
| Cross-Platform     | 5        | All 4 platforms (native OCR APIs differ)             |
| Backend            | 3        | Supabase Storage for encrypted receipt images        |
| Dependencies       | 2        | Camera APIs, ML Kit / VisionKit                      |
| **Effort Total**   | **3.5**  | Weighted average                                     |
| **Priority Score** | **1.21** | Impact / Effort                                      |

### #305 — Notification Scheduling and Smart Alerts

| Dimension          | Score    | Rationale                                           |
| ------------------ | -------- | --------------------------------------------------- |
| User Value         | 5        | Proactive money management, prevents overspending   |
| Revenue Potential  | 3        | Indirect — improves engagement, supports premium    |
| Retention Effect   | 5        | Push notifications are the strongest retention tool |
| Competitive Edge   | 4        | Smart timing is rare, most apps use dumb schedules  |
| **Impact Total**   | **4.25** | Weighted average                                    |
| Engineering        | 3        | On-device scheduling, ML for timing patterns        |
| Cross-Platform     | 4        | Platform-specific push APIs, notification channels  |
| Backend            | 2        | Push delivery only, logic is on-device              |
| Dependencies       | 2        | Requires transaction data and budget tracking       |
| **Effort Total**   | **2.75** | Weighted average                                    |
| **Priority Score** | **1.55** | Impact / Effort                                     |

### #293 — Widget Support Across All Platforms

| Dimension          | Score    | Rationale                                          |
| ------------------ | -------- | -------------------------------------------------- |
| User Value         | 4        | At-a-glance info without opening app               |
| Revenue Potential  | 2        | Free feature that drives app engagement            |
| Retention Effect   | 4        | Constant visibility on home screen boosts DAU      |
| Competitive Edge   | 3        | Many finance apps have widgets, but cross-platform |
| **Impact Total**   | **3.25** | Weighted average                                   |
| Engineering        | 4        | Each platform has unique widget framework          |
| Cross-Platform     | 5        | All 4 platforms with different APIs                |
| Backend            | 1        | No backend needed — reads local data               |
| Dependencies       | 2        | Requires design tokens for consistency             |
| **Effort Total**   | **3.0**  | Weighted average                                   |
| **Priority Score** | **1.08** | Impact / Effort                                    |

### #299 — Financial Health Score with Benchmarking

| Dimension          | Score    | Rationale                                       |
| ------------------ | -------- | ----------------------------------------------- |
| User Value         | 4        | Gamification of financial progress              |
| Revenue Potential  | 4        | Premium feature, benchmarking drives conversion |
| Retention Effect   | 4        | Monthly score creates check-in habit            |
| Competitive Edge   | 4        | Few apps have privacy-preserving benchmarking   |
| **Impact Total**   | **4.0**  | Weighted average                                |
| Engineering        | 3        | Score formula in KMP, benchmark Edge Function   |
| Cross-Platform     | 3        | Score UI on all platforms, KMP handles logic    |
| Backend            | 3        | k-anonymity aggregation, differential privacy   |
| Dependencies       | 2        | Budget and goal data must be mature             |
| **Effort Total**   | **2.75** | Weighted average                                |
| **Priority Score** | **1.45** | Impact / Effort                                 |

### #303 — Custom Report Builder

| Dimension          | Score    | Rationale                                         |
| ------------------ | -------- | ------------------------------------------------- |
| User Value         | 3        | Power users and small business, not mass market   |
| Revenue Potential  | 4        | Premium and Enterprise tier differentiator        |
| Retention Effect   | 3        | Monthly report generation creates habit           |
| Competitive Edge   | 3        | Monarch has basic reports, full builder is rare   |
| **Impact Total**   | **3.25** | Weighted average                                  |
| Engineering        | 4        | Drag-and-drop UI, chart rendering, PDF generation |
| Cross-Platform     | 4        | Complex UI differs per platform, PDF APIs differ  |
| Backend            | 2        | Only for authenticated sharing via link           |
| Dependencies       | 2        | Chart libraries per platform                      |
| **Effort Total**   | **3.0**  | Weighted average                                  |
| **Priority Score** | **1.08** | Impact / Effort                                   |

### #304 — Performance Monitoring and APM

| Dimension          | Score    | Rationale                              |
| ------------------ | -------- | -------------------------------------- |
| User Value         | 1        | Internal tool, no direct user feature  |
| Revenue Potential  | 2        | Prevents churn from performance issues |
| Retention Effect   | 3        | Performance directly affects retention |
| Competitive Edge   | 1        | Infrastructure, not differentiator     |
| **Impact Total**   | **1.75** | Weighted average                       |
| Engineering        | 3        | Instrumentation across all layers      |
| Cross-Platform     | 4        | Platform-specific reporters needed     |
| Backend            | 3        | Dashboard, alerting, metrics storage   |
| Dependencies       | 2        | OpenTelemetry or custom format         |
| **Effort Total**   | **3.0**  | Weighted average                       |
| **Priority Score** | **0.58** | Impact / Effort                        |

### #300 — Collaborative Budget Negotiation

| Dimension          | Score    | Rationale                                        |
| ------------------ | -------- | ------------------------------------------------ |
| User Value         | 3        | Only relevant to shared households               |
| Revenue Potential  | 3        | Drives family plan upgrades                      |
| Retention Effect   | 3        | Social features increase switching cost          |
| Competitive Edge   | 5        | No competitor has budget negotiation workflow    |
| **Impact Total**   | **3.5**  | Weighted average                                 |
| Engineering        | 4        | Approval state machine, threading, notifications |
| Cross-Platform     | 4        | UI for proposals/voting on all platforms         |
| Backend            | 4        | CRDT sync for proposals, push notifications      |
| Dependencies       | 4        | Requires household sharing to be mature          |
| **Effort Total**   | **4.0**  | Weighted average                                 |
| **Priority Score** | **0.88** | Impact / Effort                                  |

### #295 — Biometric-Protected Transaction Categories

| Dimension          | Score    | Rationale                                         |
| ------------------ | -------- | ------------------------------------------------- |
| User Value         | 3        | Niche but high-value for users who need it        |
| Revenue Potential  | 2        | Premium feature but narrow audience               |
| Retention Effect   | 3        | Privacy feature creates trust and lock-in         |
| Competitive Edge   | 5        | No finance app offers per-category biometric lock |
| **Impact Total**   | **3.25** | Weighted average                                  |
| Engineering        | 3        | Biometric APIs already exist, needs UI gating     |
| Cross-Platform     | 4        | Biometric APIs per platform, redaction UI         |
| Backend            | 1        | Presentation-layer only, no backend changes       |
| Dependencies       | 2        | Biometric auth must be stable (it is)             |
| **Effort Total**   | **2.5**  | Weighted average                                  |
| **Priority Score** | **1.30** | Impact / Effort                                   |

---

## Priority Ranking (Sorted by Priority Score)

| Rank | Issue | Feature                          | Impact | Effort | Score | Tier         |
| ---- | ----- | -------------------------------- | ------ | ------ | ----- | ------------ |
| 1    | #305  | Notification scheduling          | 4.25   | 2.75   | 1.55  | Must-have    |
| 2    | #299  | Financial health score           | 4.00   | 2.75   | 1.45  | Must-have    |
| 3    | #295  | Biometric-protected categories   | 3.25   | 2.50   | 1.30  | Should-have  |
| 4    | #301  | Smart receipt scanning           | 4.25   | 3.50   | 1.21  | Must-have    |
| 5    | #293  | Widget support                   | 3.25   | 3.00   | 1.08  | Should-have  |
| 6    | #303  | Custom report builder            | 3.25   | 3.00   | 1.08  | Should-have  |
| 7    | #300  | Collaborative budget negotiation | 3.50   | 4.00   | 0.88  | Nice-to-have |
| 8    | #304  | Performance monitoring (APM)     | 1.75   | 3.00   | 0.58  | Nice-to-have |

---

## Quadrant Analysis

### High Impact, Low Effort (DO FIRST)

- **#305 Notification Scheduling** — Highest ROI. On-device logic with platform
  push APIs. Directly drives retention. Ship in v2.0 Q1.
- **#299 Financial Health Score** — Strong engagement loop. KMP core logic with
  lightweight backend for opt-in benchmarking. Ship in v2.0 Q1.

### High Impact, High Effort (PLAN CAREFULLY)

- **#301 Receipt Scanning** — Highest raw impact but requires platform-specific
  OCR (VisionKit, ML Kit, Windows.Media.Ocr, Tesseract.js WASM). Plan for v2.0
  Q1-Q2 with phased platform rollout: iOS and Android first, web and Windows
  follow.

### Low Impact, Low Effort (QUICK WINS)

- **#295 Biometric-Protected Categories** — Niche but unique differentiator.
  Leverages existing biometric auth. Good sprint filler for v2.0 Q1.

### Low Impact, High Effort (DEFER)

- **#300 Collaborative Budget Negotiation** — Complex state machine dependent on
  household sharing maturity. Defer to v2.0 Q3 or later.
- **#304 Performance Monitoring** — Internal infrastructure. Important but does
  not drive user acquisition or revenue. Implement incrementally alongside other
  work rather than as a dedicated sprint.

---

## Recommended v2.0 Execution Order

### Phase 1: v2.0-alpha (Weeks 1-8)

| Issue | Feature                | Agent Types           | Weeks |
| ----- | ---------------------- | --------------------- | ----- |
| #305  | Smart notifications    | KMP + all platforms   | 1-4   |
| #299  | Financial health score | KMP + backend + plats | 3-8   |
| #295  | Biometric categories   | KMP + all platforms   | 5-8   |

### Phase 2: v2.0-beta (Weeks 9-18)

| Issue | Feature                    | Agent Types         | Weeks |
| ----- | -------------------------- | ------------------- | ----- |
| #301  | Receipt scanning (iOS+And) | KMP + iOS + Android | 9-14  |
| #293  | Platform widgets           | All platforms       | 11-16 |
| #303  | Custom report builder      | KMP + all platforms | 15-18 |

### Phase 3: v2.0 (Weeks 19-24)

| Issue | Feature                    | Agent Types           | Weeks   |
| ----- | -------------------------- | --------------------- | ------- |
| #301  | Receipt scanning (Web+Win) | Web + Windows         | 19-22   |
| #300  | Budget negotiation         | KMP + backend + plats | 19-24   |
| #304  | APM (incremental)          | All layers            | Ongoing |

---

## Dependency Map

`	ext
#305 Notifications ──> #299 Health Score (score notifications depend on notification engine)
#299 Health Score  ──> #300 Budget Negotiation (household features need health context)
#301 Receipt Scan  ──> #303 Custom Reports (receipt data enriches reports)
#295 Biometric Cat ──> (no downstream dependencies)
#293 Widgets       ──> (no downstream dependencies, but benefits from #305 data)
#304 APM           ──> (no downstream dependencies, should run parallel)
`

---

## Risk Assessment

| Feature                 | Primary Risk                           | Mitigation                           |
| ----------------------- | -------------------------------------- | ------------------------------------ |
| #301 Receipt scanning   | OCR accuracy varies by receipt quality | User confirms all parsed data        |
| #305 Notifications      | Notification fatigue / user opt-out    | Smart timing, conservative defaults  |
| #299 Health score       | Users disagree with score methodology  | Publish formula, allow weight tuning |
| #300 Budget negotiation | Sync conflicts in approval states      | CRDT-compatible state machine design |
| #303 Report builder     | Complex drag-and-drop on mobile        | Simplified stack builder for mobile  |
| #304 APM                | Telemetry overhead concerns            | Strict < 1% overhead budget, opt-in  |
| #293 Widgets            | Platform widget API differences        | Platform-specific implementations    |
| #295 Biometric cats     | Edge cases in shared households        | Sensitive data is per-user only      |

---

## Acceptance Criteria Checklist

- [x] All 8 open V2 issues scored on Impact (1-5) and Effort (1-5)
- [x] Priority matrix with Impact/Effort quadrant analysis created
- [x] Features ranked by Priority Score (Impact / Effort)
- [x] Recommended v2.0 execution order with phased timeline
- [x] Dependency map between V2 features documented
- [x] Risk assessment with mitigations for each feature
- [x] Must-have / Should-have / Nice-to-have classification assigned
