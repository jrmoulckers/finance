# Finance App — Sprint Plan (Sprints 1–5)

**Document Owner:** Product Management
**Created:** 2026-06-16
**Milestone Focus:** v1.0 (22 → 0 open issues target)
**Sprint Cadence:** 2-week sprints
**Status:** Active — Source of truth for execution

---

## Executive Summary

This plan covers 5 sprints (10 weeks) to take the Finance app from its current state (v1.0 milestone ~69% complete, 22 issues remaining) to production launch. The strategy is:

1. **Sprints 1–2:** Stabilize foundations — land open PRs, fix bugs, complete data features and core CRUD
2. **Sprints 3–4:** Quality & UX — testing, accessibility, onboarding, and user experience features
3. **Sprint 5:** Launch — production deployment, app store submissions, go/no-go review

### v1.0 Scope Decision (Sprint 1 Output)

Issue #765 will formally evaluate whether these v1.0 items should be descoped to post-launch:

- #237 (NLP input), #242 (Gamification), #315 (Dashboard widgets), #316 (Spending watchlists)
- #318 (Bulk editing), #320 (Contextual tips), #338 (Premium IAP)

**Recommendation:** Descope all Stage 9/10/12 items (#315, #316, #318, #319, #320, #338) and #237, #242 to post-launch. This reduces v1.0 to ~14 actionable issues focused on core functionality, data features, testing, and launch readiness.

### Platform Parity Matrix (Current State)

| Feature Area      | iOS | Android | Web | Windows |
| ----------------- | --- | ------- | --- | ------- |
| Accounts CRUD     | ✅  | 🟡      | ✅  | ✅      |
| Transactions CRUD | ✅  | 🟡      | ✅  | ✅      |
| Budgets CRUD      | ✅  | 🟡      | ✅  | ✅      |
| Goals CRUD        | ✅  | 🟡      | ✅  | ✅      |
| Categories        | ✅  | ✅      | ✅  | ✅      |
| Sync              | ✅  | ✅      | 🟡  | ✅      |
| Auth              | ✅  | ✅      | ✅  | ✅      |
| Biometric Auth    | ✅  | ✅      | N/A | ✅      |
| Offline Support   | ✅  | ✅      | ✅  | ✅      |
| Data Export       | ✅  | 🔴      | 🔴  | 🔴      |
| Data Import       | 🔴  | 🔴      | 🟡  | 🔴      |
| E2E Tests         | 🟡  | ✅      | 🟡  | 🔴      |
| KMP Shared Logic  | 🟡  | ✅      | N/A | ✅      |

Legend: ✅ Done | 🟡 Partial/In Progress | 🔴 Not Started | N/A Not Applicable

### Open PRs (to land in Sprint 1)

| PR   | Title                                         | Closes |
| ---- | --------------------------------------------- | ------ |
| #760 | docs: comprehensive user-facing documentation | #86    |
| #758 | test(android): E2E test framework             | #213   |
| #738 | feat(web): wire sync endpoint                 | #535   |

---

## Sprint 1: "Stabilize & Land" (Weeks 1–2)

### Sprint Goal

Land all 3 open PRs, fix the iOS Package.swift bug, complete backend foundations (database cleanup, env validation, Dockerfile), and conduct v1.0 scope review.

### Why This First

- Open PRs represent completed work that is not yet merged — highest ROI
- The #712 bug blocks iOS builds and must be fixed immediately (P1)
- Backend infrastructure (#624, #616, #609) is a dependency for production deployment
- Scope review (#765) must happen before we finalize Sprint 2+ plans

### Issues

| #    | Title                                      | Agent Type | Priority | Effort |
| ---- | ------------------------------------------ | ---------- | -------- | ------ |
| #712 | fix(ios): Package.swift missing targets    | ios        | P1       | S      |
| #535 | [Web] Wire server sync endpoint (PR #738)  | web        | P1       | M      |
| #213 | Android E2E test framework (PR #758)       | android    | P2       | L      |
| #86  | User-facing documentation (PR #760)        | docs       | P2       | L      |
| #624 | Dockerfile for API deployment              | backend    | P1       | M      |
| #616 | Environment variable validation            | backend    | P2       | S      |
| #609 | Database cleanup and balance recalculation | backend    | P2       | M      |
| #719 | iOS CI: SPM build caching                  | ci/ios     | P2       | S      |
| #605 | Harden CI pipelines                        | devops     | P2       | M      |
| #765 | **v1.0 scope review** (NEW)                | product    | P1       | S      |
| #606 | Triage open issue backlog                  | product    | P2       | S      |

**Total: 11 issues (9 engineering + 2 business/product)**

### Engineering Breakdown by Agent

- **iOS Agent:** #712 (bug fix — Package.swift targets), #719 (CI SPM caching)
- **Android Agent:** #213 (land E2E test framework PR #758)
- **Web Agent:** #535 (land sync endpoint PR #738)
- **Backend Agent:** #624 (Dockerfile), #616 (env validation), #609 (DB cleanup)
- **DevOps Agent:** #605 (harden CI pipelines)
- **Docs Agent:** #86 (land user docs PR #760)

### Business Tasks

- **#765 — v1.0 Scope Review:** Evaluate all 22 open v1.0 issues. Descope Stage 9/Phase 7 items that aren't launch-critical. This decision gates Sprint 2+ planning.
- **#606 — Backlog Triage:** Clean up stale issues, re-prioritize, and ensure all open issues have correct labels and milestones.

### Dependencies

```
#712 (iOS bug) → blocks all subsequent iOS work
#624 (Dockerfile) → needed before #771 (production provisioning, Sprint 5)
#609 (DB cleanup) → needed before #612 (recurring transactions, Sprint 2)
#765 (scope review) → gates Sprint 2 finalization
#535 (web sync) → needed before #627 (web sync UI enhancements)
```

### Risks

| Risk                                                             | Mitigation                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| PR #738 (web sync) may have merge conflicts after time in review | Rebase early in sprint, prioritize review             |
| Scope review may be contentious                                  | Pre-socialize recommendation to descope Stage 9 items |
| iOS Package.swift fix may have deeper build system implications  | Time-box to 2 days; escalate to architect if complex  |

### Definition of Done

- [ ] All 3 open PRs merged
- [ ] iOS builds green with Package.swift fix
- [ ] Backend Dockerfile builds and runs locally
- [ ] CI pipelines hardened with proper gating
- [ ] v1.0 scope finalized and communicated

---

## Sprint 2: "Data & CRUD" (Weeks 3–4)

### Sprint Goal

Complete data import/export features (Phase 7), finish Android CRUD screens and signup flow, implement recurring transactions, and begin KMP Swift Export integration for iOS.

### Why This Next

- Data import/export (#238, #239) is core v1.0 functionality enabling user onboarding
- Android CRUD screens (#630) are the biggest platform parity gap
- Recurring transactions (#612) is a frequently-requested core feature
- iOS KMP wiring (#289/#414) reduces tech debt and improves maintainability

### Issues

| #    | Title                                                | Agent Type | Priority | Effort |
| ---- | ---------------------------------------------------- | ---------- | -------- | ------ |
| #238 | Data import — CSV upload                             | shared/web | P1       | L      |
| #239 | Data export — JSON/CSV                               | shared     | P1       | M      |
| #611 | Web CSV import with column mapping                   | web        | P2       | M      |
| #630 | Android CRUD screens (accounts, budgets, goals, txn) | android    | P1       | XL     |
| #631 | Android signup screen with email registration        | android    | P1       | M      |
| #612 | Recurring transaction processing                     | backend    | P2       | L      |
| #289 | iOS: Wire KMP shared logic via Swift Export          | ios/kmp    | P2       | L      |
| #610 | Sync health report Edge Function                     | backend    | P2       | M      |
| #764 | **Analytics event tracking** (NEW)                   | shared     | P2       | L      |
| #198 | Set up GitHub Discussions                            | infra      | P3       | XS     |

**Total: 10 issues (8 engineering + 1 business + 1 community)**

### Engineering Breakdown by Agent

- **KMP/Shared Agent:** #238 (data import core), #239 (data export core), #764 (analytics)
- **iOS Agent:** #289 (KMP Swift Export wiring)
- **Android Agent:** #630 (CRUD screens), #631 (signup screen)
- **Web Agent:** #611 (CSV import UI with column mapping)
- **Backend Agent:** #612 (recurring transactions), #610 (sync health report)

### Business Tasks

- **#764 — Analytics Instrumentation:** Define and implement core analytics events in KMP shared layer. This is both engineering and business — the event definitions are a product decision.
- **#198 — GitHub Discussions:** Set up community communication channel for beta users and contributors.

### Dependencies

```
#609 (Sprint 1, DB cleanup) → #612 (recurring transactions)
#535 (Sprint 1, web sync) → #611 (web CSV import)
#238 (data import core) → #611 (web CSV import UI)
#289 (KMP wiring) ← blocks further iOS shared logic work
Sprint 1 scope review (#765) → confirms these are v1.0
```

### Risks

| Risk                                                                | Mitigation                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Android CRUD (#630) is XL effort — may not complete in one sprint   | Split into accounts+transactions (Sprint 2) and budgets+goals (Sprint 3) |
| CSV import parsing edge cases (encodings, delimiters, date formats) | Define supported formats upfront; iterate on edge cases post-launch      |
| KMP Swift Export is complex and may have toolchain issues           | Time-box to 1 week; if blocked, defer remaining wiring to Sprint 3       |

### Definition of Done

- [ ] Users can import CSV data on web platform
- [ ] Users can export data as JSON/CSV on all platforms
- [ ] Android has functional CRUD screens for all entity types
- [ ] Android signup flow works end-to-end
- [ ] Recurring transactions process on schedule
- [ ] Analytics events firing in development builds

---

## Sprint 3: "Quality & Accessibility" (Weeks 5–6)

### Sprint Goal

Complete the WCAG 2.2 AA accessibility audit, expand test coverage across platforms, implement cognitive accessibility mode, and optimize web performance.

### Why This Next

- Accessibility (#77) is a v1.0 launch requirement and legal/ethical imperative
- Test coverage gaps create launch risk — need confidence before release
- Web performance (#770) must be validated before production deployment
- Architecture documentation (#197) supports long-term maintainability

### Issues

| #    | Title                                          | Agent Type | Priority | Effort |
| ---- | ---------------------------------------------- | ---------- | -------- | ------ |
| #77  | Full Accessibility Audit (WCAG 2.2 AA)         | all        | P1       | XL     |
| #317 | Cognitive accessibility mode                   | shared     | P2       | L      |
| #604 | Web E2E test coverage and accessibility gaps   | web        | P1       | L      |
| #651 | iOS XCUITest automation suite                  | ios        | P1       | L      |
| #618 | Android ViewModel unit test coverage           | android    | P2       | M      |
| #770 | **Web performance audit & optimization** (NEW) | web        | P2       | M      |
| #687 | Web performance budgets in CI                  | devops     | P2       | M      |
| #204 | Compose Preview catalog for all UI components  | android    | P3       | M      |
| #197 | Architecture diagram generator from code       | docs       | P3       | M      |
| #768 | **First-time user onboarding flow** (NEW)      | shared/all | P2       | L      |

**Total: 10 issues (8 engineering + 1 design + 1 docs)**

### Engineering Breakdown by Agent

- **KMP/Shared Agent:** #317 (cognitive accessibility), #768 (onboarding flow design + shared logic)
- **iOS Agent:** #651 (XCUITest automation)
- **Android Agent:** #618 (ViewModel unit tests), #204 (Compose Preview catalog)
- **Web Agent:** #604 (E2E tests + a11y), #770 (performance audit)
- **DevOps Agent:** #687 (web performance budgets in CI)
- **All Platforms:** #77 (accessibility audit — each platform tests their own)

### Business Tasks

- **#768 — Onboarding Flow:** Design the first-time user experience. This is primarily a design/product task that feeds into Sprint 4 implementation.
- **#197 — Architecture Diagrams:** Auto-generate architecture documentation for maintainability and onboarding new contributors.

### Dependencies

```
#77 (accessibility audit) → informs #317 (cognitive accessibility implementation)
#604 (web E2E) + #770 (web perf) → #687 (CI enforcement)
#630 (Sprint 2, Android CRUD) → #618 (ViewModel tests need screens to test)
#768 (onboarding design) → implementation in Sprint 4
```

### Risks

| Risk                                                       | Mitigation                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| Accessibility audit may reveal extensive remediation needs | Triage findings: fix P0/P1 before launch, P2/P3 post-launch                 |
| XCUITest suite is slow and may be flaky                    | Focus on critical user journeys (5-8 tests), not exhaustive coverage        |
| Cognitive accessibility mode scope is ambiguous            | Define clear scope: simplified UI, larger touch targets, reduced animations |

### Definition of Done

- [ ] Accessibility audit report generated for all platforms
- [ ] Critical accessibility violations fixed
- [ ] Web Lighthouse scores ≥90/95/90/90 (Perf/A11y/BP/SEO)
- [ ] iOS has automated UI tests for 5+ critical user journeys
- [ ] Android ViewModel test coverage ≥80%
- [ ] Web performance budgets enforced in CI
- [ ] Onboarding flow designed and approved

---

## Sprint 4: "Polish & Integration" (Weeks 7–8)

### Sprint Goal

Implement user onboarding flow, complete remaining v1.0 features (data import refinement, financial insights), finalize production deployment infrastructure, and prepare app store submissions.

### Why This Next

- Onboarding (#768) needs implementation after Sprint 3 design
- Financial insights (#241) adds key value differentiation for launch
- Production infrastructure (#615, #771) must be ready before Sprint 5 go/no-go
- App store submissions (#653, #766) have review lead times — submit early

### Issues

| #    | Title                                              | Agent Type | Priority | Effort |
| ---- | -------------------------------------------------- | ---------- | -------- | ------ |
| #241 | Financial insights                                 | shared     | P2       | L      |
| #653 | iOS App Store submission preparation               | ios        | P1       | M      |
| #766 | **Google Play Store submission preparation** (NEW) | android    | P1       | M      |
| #615 | Production deployment checklist                    | backend    | P1       | M      |
| #771 | **Production env provisioning & smoke test** (NEW) | backend    | P1       | L      |
| #623 | Automate mobile version bumping                    | devops     | P2       | M      |
| #772 | **Release artifact automation** (NEW)              | devops     | P2       | L      |
| #686 | Database performance optimization                  | backend    | P2       | M      |
| #414 | iOS: Complete KMP shared logic integration         | ios/kmp    | P2       | L      |
| #644 | Android Sprint 4 polish (localization, analytics)  | android    | P2       | M      |
| #767 | **v1.0 launch communications plan** (NEW)          | marketing  | P2       | M      |

**Total: 11 issues (9 engineering + 1 marketing + 1 devops/business)**

### Engineering Breakdown by Agent

- **KMP/Shared Agent:** #241 (financial insights)
- **iOS Agent:** #653 (App Store prep), #414 (complete KMP integration)
- **Android Agent:** #766 (Google Play prep), #644 (polish + localization)
- **Backend Agent:** #615 (deployment checklist), #771 (production provisioning), #686 (DB optimization)
- **DevOps Agent:** #623 (version bumping), #772 (release artifacts)

### Business Tasks

- **#767 — Launch Communications:** Write store descriptions, prepare changelog, draft announcement. Must be done before app store submissions.
- **#623 — Version Bumping:** While technically DevOps, this is a release management concern that product must validate.

### Dependencies

```
#624 (Sprint 1, Dockerfile) → #771 (production provisioning)
#609 (Sprint 1, DB cleanup) → #686 (DB performance)
#768 (Sprint 3, onboarding design) → implementation happens alongside #241
#764 (Sprint 2, analytics) → #644 (Android analytics wiring)
#767 (launch comms) → #653 (iOS store listing), #766 (Android store listing)
#615 (deployment checklist) → #771 (production provisioning)
#772 (release artifacts) → depends on #623 (version bumping)
```

### Risks

| Risk                                            | Mitigation                                                  |
| ----------------------------------------------- | ----------------------------------------------------------- |
| App store review may reject or require changes  | Submit to TestFlight/internal track first for pre-review    |
| Production provisioning may reveal infra issues | Allocate buffer time; have Supabase support contact ready   |
| Financial insights scope may expand             | Define MVP: spending trends chart + monthly comparison only |

### Definition of Done

- [ ] iOS build submitted to TestFlight / App Store Connect
- [ ] Android AAB uploaded to Google Play internal testing track
- [ ] Production Supabase environment operational
- [ ] Database performance meets baselines
- [ ] Release artifacts auto-generated in CI
- [ ] Launch communications drafted and reviewed
- [ ] Financial insights visible on dashboard

---

## Sprint 5: "Launch" (Weeks 9–10)

### Sprint Goal

Execute v1.0 launch: final go/no-go review, production deployment, app store releases, and post-launch monitoring activation.

### Why This Last

- This is the culmination sprint — all dependencies should be resolved
- Go/no-go (#769) is the final quality gate
- Any remaining bug fixes or polish are addressed here
- Post-launch monitoring ensures we catch issues fast

### Issues

| #    | Title                                               | Agent Type | Priority | Effort |
| ---- | --------------------------------------------------- | ---------- | -------- | ------ |
| #769 | **v1.0 release go/no-go review** (NEW)              | product    | P0       | M      |
| #41  | Windows app project finalization                    | windows    | P2       | M      |
| #77  | Accessibility audit — remediation completion        | all        | P1       | M      |
| #627 | Web sync UI enhancements + responsive breakpoints   | web        | P2       | M      |
| #685 | Notification & email infrastructure                 | backend    | P2       | L      |
| #728 | Document fleet autonomous operations                | docs       | P3       | S      |
| #645 | iOS transaction pagination                          | ios        | P2       | M      |
| #646 | iOS transaction list performance                    | ios        | P2       | M      |
| #647 | iOS transaction detail enhancements                 | ios        | P3       | S      |
| —    | Bug-fix buffer (reserve capacity for launch issues) | all        | P1       | M      |
| —    | Post-launch monitoring activation                   | ops        | P1       | S      |

**Total: 11 issues (8 engineering + 1 product + 1 ops + 1 buffer)**

### Engineering Breakdown by Agent

- **iOS Agent:** #645 (pagination), #646 (list performance), #647 (detail enhancements)
- **Android Agent:** Bug fixes from beta feedback, final polish
- **Web Agent:** #627 (sync UI + responsive breakpoints)
- **Windows Agent:** #41 (finalize Windows app project)
- **Backend Agent:** #685 (notification infrastructure)
- **Docs Agent:** #728 (fleet operations docs)

### Business Tasks

- **#769 — Go/No-Go Review:** Formal launch readiness assessment against checklist. Every P0/P1 item must be resolved. References docs/ops/launch-readiness-plan.md.
- **Post-launch monitoring activation:** Enable all dashboards and alerts defined in the launch monitoring plan.

### Dependencies

```
ALL Sprint 1-4 work → #769 (go/no-go review)
#771 (Sprint 4, production env) → production deployment
#653 + #766 (Sprint 4, store submissions) → store approvals (external dependency)
#77 (Sprint 3, audit) → remediation completion
#535 (Sprint 1, web sync) → #627 (web sync UI)
```

### Risks

| Risk                                 | Mitigation                                                         |
| ------------------------------------ | ------------------------------------------------------------------ |
| App store review delays              | Submit in Sprint 4 to absorb delays; have expedited review ready   |
| Critical bugs discovered in go/no-go | Bug-fix buffer allocated; delay launch if P0 found                 |
| Production environment instability   | Canary release to beta users first; staged rollout                 |
| Post-launch support load             | Pre-write FAQ, known issues doc; monitor support channels actively |

### Launch Sequence (Sprint 5, Week 10)

1. **Day 1-2:** Go/no-go review meeting. Sign off on all checklist items.
2. **Day 3:** Deploy backend to production. Run smoke tests.
3. **Day 4:** Activate monitoring dashboards and alerts.
4. **Day 5:** Release web app. Submit iOS + Android for store review (if not already approved).
5. **Day 6-7:** Monitor metrics. Address any P0 issues.
6. **Day 8:** Publish Windows app (Microsoft Store or direct download).
7. **Day 9:** Send launch announcements per #767 communications plan.
8. **Day 10:** Post-launch retrospective.

### Definition of Done

- [ ] Go/no-go review passed — all criteria met
- [ ] Production backend deployed and stable
- [ ] iOS app approved and live on App Store
- [ ] Android app approved and live on Google Play
- [ ] Web app deployed to production URL
- [ ] Windows app available for download
- [ ] Monitoring dashboards active with alerts configured
- [ ] Launch announcement published

---

## Cross-Sprint Dependency Graph

```
Sprint 1                    Sprint 2                Sprint 3              Sprint 4              Sprint 5
─────────                   ─────────               ─────────             ─────────             ─────────
#712 (iOS bug fix) ─────────────────────────────────────────────────────────────────────────────>
#535 (web sync) ──────────> #611 (CSV import) ──────────────────────────> #627 (sync UI)
#624 (Dockerfile) ──────────────────────────────────> #771 (prod env) ──> deployment
#609 (DB cleanup) ────────> #612 (recurring txn)
                            #630 (Android CRUD) ──> #618 (VM tests)
                            #764 (analytics) ──────────────────────────> #644 (android polish)
                            #289 (iOS KMP) ────────────────────────────> #414 (complete KMP)
                                                    #77 (a11y audit) ──> remediation ─────────> #769 (go/no-go)
                                                    #768 (onboarding) ─> implementation
                                                                          #615 (checklist) ──> #771 (provisioning)
                                                                          #653 (iOS store) ──> store approval
                                                                          #766 (Play store) ─> store approval
                                                                          #767 (comms) ──────> #769 (go/no-go)
#765 (scope review) ──────> gates Sprint 2+ scope
```

---

## New Issues Created

| #    | Title                                                       | Sprint |
| ---- | ----------------------------------------------------------- | ------ |
| #765 | task(product): v1.0 scope review — descoping candidates     | 1      |
| #764 | task(analytics): Analytics event tracking & KPI instrument. | 2      |
| #767 | task(marketing): v1.0 launch communications plan            | 4      |
| #766 | task(android): Google Play Store submission preparation     | 4      |
| #769 | task(product): v1.0 release go/no-go review                 | 5      |
| #768 | task(design): First-time user onboarding flow               | 3      |
| #771 | task(backend): Production env provisioning & smoke testing  | 4      |
| #770 | task(web): Web performance audit & optimization             | 3      |
| #772 | task(devops): Release artifact automation                   | 4      |

---

## v1.0 Issue Disposition Summary

### Included in Sprints 1–5 (Launch-Critical)

- #535, #289, #414, #213, #204, #198, #197, #77, #41
- #238, #239, #241

### Recommended for Descoping to Post-Launch

- #237 (NLP input) — complex ML/NLP feature, not core MVP
- #242 (Gamification) — engagement feature, adds risk without core value
- #315 (Dashboard widgets) — enhancement, basic dashboard sufficient for launch
- #316 (Spending watchlists) — advanced alerting, post-launch feature
- #318 (Bulk editing) — power user feature
- #319 (Quick-entry mode) — UX optimization, not launch blocker
- #320 (Contextual tips) — content-dependent, can be added incrementally
- #332 (Rate limiting on Edge Functions) — API rate limiting done (#614); edge function limiting is incremental
- #338 (Premium IAP) — monetization should follow user acquisition, not precede it

### Rationale

Descoping 9 items reduces v1.0 from 22 to 13 actionable issues. This focuses the team on **core functionality, quality, and launch readiness** rather than advanced features that can be shipped in v1.1/v1.2 updates post-launch. Monetization (#338) specifically benefits from waiting — we need users and feedback before gating features.

---

## Velocity Assumptions

- **Per sprint:** 8–12 issues across all agents
- **Agent parallelism:** iOS, Android, Web, Backend, DevOps can work simultaneously
- **Bottlenecks:** KMP/shared work gates platform work; backend gates production deployment
- **Buffer:** 10-15% capacity reserved for unplanned bugs and support

## Sprint Metrics to Track

| Metric                    | Target      |
| ------------------------- | ----------- |
| Sprint completion rate    | ≥ 85%       |
| v1.0 burndown             | Linear to 0 |
| Open PR age               | < 3 days    |
| P0/P1 bugs open           | 0 at launch |
| Test coverage (aggregate) | ≥ 75%       |
| Accessibility score       | ≥ 95 (web)  |

---

_This document is the source of truth for sprint execution. Updated after each sprint retrospective._
