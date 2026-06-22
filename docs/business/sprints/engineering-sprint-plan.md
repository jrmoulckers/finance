# Engineering Sprint Plan — Backlog Issue Assignments

> **Owner:** Product Management
> **Date:** 2025-07-27
> **Scope:** Unplanned engineering backlog issues assigned to Sprints 6–10
> **Status:** Proposed — Pending engineering review
> **Related:** [Sprint Plan 6–10](sprint-plan-6-10.md) · [Stability Review](sprint-6-stability-review.md)

---

## Overview

This document assigns unplanned engineering backlog issues to specific sprints based on the post-launch stability review (#788), v1.1 release scope (#792), and Sprint 8 scope adjustment (#794). Each assignment includes rationale, priority, dependencies, and the recommended agent type.

### Assignment Criteria

1. **Priority:** P0/P1 issues assigned to earliest possible sprint
2. **Dependencies:** KMP/backend issues scheduled before platform agents that depend on them
3. **Balanced sprints:** 4–6 engineering tasks per sprint + 1–2 business/product tasks
4. **Platform parity:** Address cross-platform gaps before adding new features
5. **Security first:** Security hardening prioritized for live financial app

---

## Sprint Assignment Matrix

| #    | Issue Title                          | Sprint | Priority | Agent Type   | Dependencies              | Rationale                                                         |
| ---- | ------------------------------------ | ------ | -------- | ------------ | ------------------------- | ----------------------------------------------------------------- |
| #771 | Backend production provisioning      | **6**  | P1       | Backend      | None                      | Production must be hardened before any feature work               |
| #764 | Analytics instrumentation            | **7**  | P1       | KMP/Shared   | #771 (backend ready)      | Unblocks all data-driven decisions; conversion funnel measurement |
| #766 | Android Play Store submission        | **7**  | P2       | Android      | None                      | Revenue channel activation; app store presence                    |
| #535 | Web sync endpoint wiring             | **7**  | P2       | Web          | None                      | Platform parity fix; web sync is stubbed                          |
| #770 | Web performance audit                | **7**  | P2       | Web          | None                      | User retention; performance gaps identified                       |
| #772 | Release artifact automation          | **7**  | P2       | DevOps       | None                      | Reduces release toil; enables faster iteration                    |
| #329 | Certificate pinning (all platforms)  | **7**  | P1       | KMP/Security | None                      | MITM protection for live financial app                            |
| #332 | Rate limiting on Edge Functions      | **7**  | P1       | Backend      | #771 (backend ready)      | API abuse protection                                              |
| #77  | Accessibility audit (WCAG 2.2 AA)    | **8**  | P1       | QA/All       | None                      | Legal compliance; 15%+ of users affected                          |
| #414 | iOS KMP bridge completion            | **8**  | P2       | iOS          | None                      | Foundation for iOS v1.2 features                                  |
| #381 | Android widgets (Material You)       | **8**  | P2       | Android      | None                      | Growth lever; user engagement                                     |
| #330 | RASP implementation                  | **8**  | P2       | KMP/Security | #329 (cert pinning first) | Security hardening continuation                                   |
| #331 | Device attestation                   | **8**  | P2       | KMP/Security | #329 (cert pinning first) | Security hardening continuation                                   |
| #333 | Liveness detection for biometrics    | **9**  | P3       | KMP/Security | #330, #331                | Security hardening; lower risk area                               |
| #334 | Session binding / device fingerprint | **9**  | P3       | KMP/Security | #330, #331                | Security hardening; session hijack mitigation                     |

---

## Sprint 6: Post-Launch Stabilization (Weeks 11–12)

### Engineering Tasks

| #    | Title                                             | Priority | Agent   | Effort | Notes                                                                                          |
| ---- | ------------------------------------------------- | -------- | ------- | ------ | ---------------------------------------------------------------------------------------------- |
| #771 | Backend production provisioning and smoke testing | P1       | Backend | M      | Must be production-ready before stability can be validated. Smoke tests for all API endpoints. |

### Product Tasks (already assigned)

| #    | Title                                       | Priority |
| ---- | ------------------------------------------- | -------- |
| #788 | Post-launch stability review and bug triage | P1       |

### Sprint 6 Balance

- Engineering tasks: 1 (backend focus — stabilization sprint)
- Product tasks: 1
- Rationale: Sprint 6 is deliberately light on new engineering to allow post-launch monitoring. The existing Sprint 6 plan already includes APM (#304), monitoring setup, and bug fixes. Adding #771 ensures backend is hardened.

---

## Sprint 7: Revenue Foundation (Weeks 13–14)

### Engineering Tasks

| #    | Title                                              | Priority | Agent        | Effort | Dependencies   |
| ---- | -------------------------------------------------- | -------- | ------------ | ------ | -------------- |
| #764 | Analytics event tracking and KPI instrumentation   | P1       | KMP          | L      | #771 (backend) |
| #329 | Certificate pinning on all platforms               | P1       | KMP/Security | M      | None           |
| #332 | Rate limiting on all Edge Functions                | P1       | Backend      | M      | #771           |
| #535 | Web sync endpoint — replace replayMutations stub   | P2       | Web          | M      | None           |
| #766 | Google Play Store submission preparation           | P2       | Android      | S      | None           |
| #770 | Web application performance audit and optimization | P2       | Web          | M      | None           |
| #772 | Release artifact automation for all platforms      | P2       | DevOps       | M      | None           |

### Product Tasks (already assigned)

| #    | Title                                      | Priority |
| ---- | ------------------------------------------ | -------- |
| #792 | v1.1 release planning and scope definition | P2       |
| #793 | Premium tier paywall and upgrade UX design | P1       |

### Sprint 7 Balance

- Engineering tasks: 7 (heavy sprint — revenue foundation requires broad work)
- Product tasks: 2
- Notes: This is the largest engineering sprint. Consider splitting into 7a/7b if capacity is constrained. Prioritize #764 (analytics) and #329/#332 (security) as must-ship. #766, #770, #772 can slip to Sprint 8 if needed.

### Dependency Chain

```
#771 (Sprint 6, backend) ──→ #764 (analytics, needs backend)
                          ──→ #332 (rate limiting, needs backend)

#329 (cert pinning) ──→ Independent, start immediately

#535, #766, #770, #772 ──→ Independent, parallel work
```

---

## Sprint 8: Growth and Retention (Weeks 15–16)

### Engineering Tasks

| #    | Title                                           | Priority | Agent        | Effort | Dependencies    |
| ---- | ----------------------------------------------- | -------- | ------------ | ------ | --------------- |
| #77  | Full Accessibility Audit (WCAG 2.2 AA)          | P1       | QA/All       | L      | None            |
| #414 | iOS KMP shared logic bridge completion          | P2       | iOS          | L      | None            |
| #381 | Android widgets (Material You + Quick Settings) | P2       | Android      | L      | None            |
| #330 | Runtime application self-protection (RASP)      | P2       | KMP/Security | M      | #329 (Sprint 7) |
| #331 | Device attestation and integrity verification   | P2       | KMP/Security | M      | #329 (Sprint 7) |

### Product Tasks (already assigned)

| #    | Title                                               | Priority |
| ---- | --------------------------------------------------- | -------- |
| #794 | Growth metrics review and Sprint 8 scope adjustment | P2       |
| #795 | i18n market prioritization research                 | P2       |

### Sprint 8 Balance

- Engineering tasks: 5 (balanced)
- Product tasks: 2
- Notes: Diverse agent coverage (QA, iOS, Android, KMP/Security). #77 accessibility audit is large and may span into Sprint 9. Security work (#330, #331) depends on #329 completing in Sprint 7.

### Dependency Chain

```
#329 (Sprint 7) ──→ #330 (RASP)
                ──→ #331 (device attestation)

#77, #414, #381 ──→ Independent, parallel work
```

---

## Sprint 9: Smart Features (Weeks 17–18)

### Engineering Tasks

| #    | Title                                     | Priority | Agent        | Effort | Dependencies          |
| ---- | ----------------------------------------- | -------- | ------------ | ------ | --------------------- |
| #333 | Liveness detection for biometric auth     | P3       | KMP/Security | M      | #330, #331 (Sprint 8) |
| #334 | Session binding and device fingerprinting | P3       | KMP/Security | M      | #330, #331 (Sprint 8) |

### Product Tasks (already assigned)

| #    | Title                                               | Priority |
| ---- | --------------------------------------------------- | -------- |
| #796 | AI feature ethics review and guidelines             | P2       |
| #797 | Smart features beta program and feedback collection | P2       |

### Sprint 9 Balance

- Engineering tasks from this backlog: 2 (security completion)
- Product tasks: 2
- Notes: Sprint 9's primary engineering focus is AI features (#263, #322, #323, #324, #325, #327) which are already planned in the Sprint Plan 6-10. The two security issues (#333, #334) complete the Stage 11 security hardening initiative started in Sprint 7.

---

## Sprint 10: Advanced Features and Expansion (Weeks 19–20)

### Engineering Tasks from Backlog

No additional backlog items assigned to Sprint 10. The existing Sprint 10 plan covers:

- Bank connection API integration (#798)
- Receipt scanning OCR
- Family/household collaboration
- v1.2 release preparation

### Overflow Buffer

If any Sprint 7–9 items slip, Sprint 10 has capacity to absorb:

- #770 Web performance audit (if slipped from Sprint 7)
- #772 Release artifact automation (if slipped from Sprint 7)
- #77 Accessibility audit continuation (if not completed in Sprint 8)

---

## Workload Distribution by Agent Type

| Agent Type     | Sprint 6 | Sprint 7   | Sprint 8   | Sprint 9   | Total  |
| -------------- | -------- | ---------- | ---------- | ---------- | ------ |
| **Backend**    | #771     | #332       | —          | —          | 2      |
| **KMP/Shared** | —        | #764, #329 | #330, #331 | #333, #334 | 6      |
| **iOS**        | —        | —          | #414       | —          | 1      |
| **Android**    | —        | #766       | #381       | —          | 2      |
| **Web**        | —        | #535, #770 | —          | —          | 2      |
| **DevOps**     | —        | #772       | —          | —          | 1      |
| **QA/All**     | —        | —          | #77        | —          | 1      |
| **Total**      | 1        | 7          | 5          | 2          | **15** |

### Agent Load Visualization

```
Sprint 6:  ▓░░░░░░░░░  (1 task — stabilization)
Sprint 7:  ▓▓▓▓▓▓▓░░░  (7 tasks — heavy, revenue sprint)
Sprint 8:  ▓▓▓▓▓░░░░░  (5 tasks — balanced)
Sprint 9:  ▓▓░░░░░░░░  (2 tasks — AI features are separate)
```

---

## Dependency Graph (Full)

```
Sprint 6                Sprint 7                Sprint 8              Sprint 9
────────                ────────                ────────              ────────

#771 Backend ──────────→ #764 Analytics
        │               #332 Rate Limiting
        │
        └──────────────→ (v1.1 release readiness)

                        #329 Cert Pinning ─────→ #330 RASP ──────→ #333 Biometric
                                                  #331 Attestation → #334 Session

                        #535 Web Sync             #77 Accessibility
                        #766 Play Store           #414 iOS KMP
                        #770 Web Perf             #381 Android Widgets
                        #772 Release Auto
```

---

## Risk Register

| Risk                                             | Sprint | Likelihood | Impact   | Mitigation                                                     |
| ------------------------------------------------ | ------ | ---------- | -------- | -------------------------------------------------------------- |
| Sprint 7 overloaded (7 tasks)                    | 7      | High       | Medium   | Designate #766, #770, #772 as spillable to Sprint 8            |
| #329 cert pinning breaks API calls               | 7      | Medium     | Critical | Staged rollout, kill switch, test on all platforms             |
| #77 accessibility audit is larger than estimated | 8      | Medium     | Medium   | Phase audit: critical issues in Sprint 8, cosmetic in Sprint 9 |
| #414 iOS KMP bridge has unknown scope            | 8      | Medium     | Medium   | Spike task in Sprint 7 to assess scope                         |
| Security dependencies create a chain             | 7–9    | Low        | Medium   | #329 is independent; only #330+ depends on it                  |

---

## Capacity Planning Notes

### Sprint 7 Overload Mitigation

Sprint 7 has 7 engineering tasks — the most of any sprint. If capacity is constrained:

**Must-ship (cannot slip):**

1. #764 Analytics instrumentation — blocks all data-driven work
2. #329 Certificate pinning — security requirement for live app
3. #332 Rate limiting — API protection for live app

**Should-ship (slip to Sprint 8 if needed):** 4. #535 Web sync endpoint — platform parity 5. #766 Play Store submission — revenue channel

**Can slip (move to Sprint 8-9):** 6. #770 Web performance audit — important but not blocking 7. #772 Release artifact automation — reduces toil but not urgent

### Engineering Hours Estimate

| Sprint   | Estimated Eng Hours | Agent Parallelism | Calendar Days |
| -------- | ------------------- | ----------------- | ------------- |
| Sprint 6 | 20-30 hrs           | 1 agent           | 2-3 days      |
| Sprint 7 | 80-120 hrs          | 5 agents parallel | 5-7 days      |
| Sprint 8 | 60-80 hrs           | 4 agents parallel | 5-6 days      |
| Sprint 9 | 20-30 hrs           | 1-2 agents        | 2-3 days      |

---

## Approval and Review

- [ ] Engineering lead reviewed workload distribution
- [ ] @architect reviewed dependency ordering
- [ ] @security-reviewer confirmed security issue prioritization
- [ ] DevOps confirmed #772 scope and Sprint 7 feasibility
- [ ] iOS lead confirmed #414 scope estimate
- [ ] Product manager approved final sprint assignments
