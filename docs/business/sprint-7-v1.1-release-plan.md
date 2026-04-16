# v1.1 Release Planning and Scope Definition

> **Sprint:** 7 — Revenue Foundation
> **Issue:** #792
> **Priority:** P2 — Medium
> **Date:** 2025-07-27
> **Owner:** Product Management
> **Target Release:** Week 14 (end of Sprint 7)
> **Status:** Complete

---

## Executive Summary

v1.1 is the first major update after the v1.0 launch. It bundles post-launch stabilization fixes with the monetization foundation (Premium tier). This document defines the release scope, acceptance criteria, timeline, and go/no-go checklist.

---

## Release Scope

### v1.1 Theme: "Stability + Revenue Foundation"

v1.1 delivers three strategic pillars:

1. **Stability hardening** — Security patches, monitoring, performance fixes
2. **Monetization foundation** — Freemium gating, Premium IAP on all platforms
3. **Quick wins** — Features descoped from v1.0 that are ready to ship

### Feature Scope

#### Tier 1: Must-Ship (Release Blockers)

| #    | Feature                              | Platform                   | Status  | Owner              |
| ---- | ------------------------------------ | -------------------------- | ------- | ------------------ |
| #329 | Certificate pinning on all platforms | iOS, Android, Windows      | Planned | @security-reviewer |
| #332 | Rate limiting on all Edge Functions  | Backend                    | Planned | Backend agent      |
| #337 | Freemium tier feature gating         | All                        | Planned | KMP agent          |
| #338 | Premium subscription IAP             | iOS, Android, Web, Windows | Planned | Platform agents    |
| #764 | Analytics event tracking             | Shared                     | Planned | KMP agent          |
| #771 | Production environment provisioning  | Backend                    | Planned | Backend agent      |

#### Tier 2: Should-Ship (High Value, Low Risk)

| #    | Feature                      | Platform | Status      | Owner         |
| ---- | ---------------------------- | -------- | ----------- | ------------- |
| #535 | Web sync endpoint wiring     | Web      | In progress | Web agent     |
| #766 | Google Play Store submission | Android  | Planned     | Android agent |
| #770 | Web performance audit        | Web      | Planned     | Web agent     |
| #772 | Release artifact automation  | DevOps   | Planned     | DevOps agent  |
| #320 | Contextual financial tips    | All      | Planned     | Design agent  |

#### Tier 3: Nice-to-Have (Ship If Ready)

| #    | Feature                           | Platform  | Status  | Owner     |
| ---- | --------------------------------- | --------- | ------- | --------- |
| #340 | Privacy-as-premium marketing      | Marketing | Planned | Marketing |
| #77  | Accessibility audit (WCAG 2.2 AA) | All       | Planned | QA agent  |
| #342 | Referral program                  | All       | Planned | Product   |

### Out of Scope for v1.1

The following are explicitly **not** in v1.1 and are deferred to v1.2:

- AI/ML features (#263, #322, #323, #324, #325, #326, #327, #328)
- Bank connections (Sprint 10)
- Receipt scanning (Sprint 10)
- Platform widgets (#381 — Sprint 8)
- i18n framework (Sprint 8)
- Family/household plan (#339 — Sprint 10)

---

## Acceptance Criteria

### Release Go/No-Go Checklist

- [ ] **Stability:** Crash-free rate ≥99.5% on all platforms (requires APM #304)
- [ ] **Security:** Certificate pinning (#329) deployed on iOS, Android, Windows
- [ ] **Security:** Rate limiting (#332) active on all Edge Functions
- [ ] **Monetization:** Freemium gating (#337) correctly gates Premium features
- [ ] **Monetization:** Premium IAP (#338) purchasable on iOS, Android, Web, Windows
- [ ] **Monetization:** Free trial flow works end-to-end on all platforms
- [ ] **Analytics:** Core events (#764) firing — DAU/MAU, feature usage, conversion funnel
- [ ] **Production:** Backend provisioning (#771) complete with smoke tests passing
- [ ] **Sync:** Web sync endpoint (#535) wired and functional
- [ ] **Compliance:** No open P0 or P1 bugs at release time
- [ ] **Store:** App store listing updated with v1.1 "What's New" text
- [ ] **Store:** Google Play submission (#766) approved (if ready)

### Per-Platform Acceptance

| Platform    | Must Pass                                                                                |
| ----------- | ---------------------------------------------------------------------------------------- |
| **iOS**     | Cert pinning, Premium IAP, analytics events, crash-free ≥99.5%                           |
| **Android** | Cert pinning, Premium IAP, analytics events, crash-free ≥99.5%, Play Store listing       |
| **Web**     | Sync endpoint wired, Premium subscription, analytics events, performance audit addressed |
| **Windows** | Cert pinning, Premium IAP, analytics events, crash-free ≥99.5%                           |

---

## Timeline

### Sprint 7 Schedule (Weeks 13–14)

| Week           | Milestone                    | Details                                    |
| -------------- | ---------------------------- | ------------------------------------------ |
| Week 13, Day 1 | Sprint 7 kickoff             | All Tier 1 issues assigned and in progress |
| Week 13, Day 3 | Freemium gating PR ready     | #337 code review                           |
| Week 13, Day 5 | Security hardening PRs ready | #329, #332 code review                     |
| Week 14, Day 1 | Feature freeze               | No new features after this date            |
| Week 14, Day 2 | Integration testing          | Cross-platform Premium flow validation     |
| Week 14, Day 3 | Release candidate build      | All platforms built with v1.1 tag          |
| Week 14, Day 4 | Go/no-go review              | Product + Engineering + Security sign-off  |
| Week 14, Day 5 | v1.1 release                 | Staged rollout (10% → 50% → 100%)          |

### Rollout Strategy

1. **Day 1:** 10% rollout on Android (Play Store staged rollout), full release on Web
2. **Day 2:** Monitor crash rates and conversion metrics
3. **Day 3:** 50% Android rollout, submit iOS update for review
4. **Day 5:** 100% rollout on all platforms (assuming no regressions)
5. **Day 7:** Windows Store update submitted

---

## Risk Assessment

| Risk                                  | Likelihood | Impact   | Mitigation                                      |
| ------------------------------------- | ---------- | -------- | ----------------------------------------------- |
| Premium IAP rejected by app stores    | Medium     | High     | Submit early, follow store guidelines strictly  |
| Analytics events not firing correctly | Low        | High     | Integration tests, manual QA on each platform   |
| Certificate pinning breaks API calls  | Medium     | Critical | Staged rollout, kill switch, cert rotation plan |
| Rate limiting too aggressive          | Low        | Medium   | Start with generous limits, monitor 429 rates   |
| Web sync endpoint regressions         | Low        | Medium   | E2E tests cover sync flows                      |

---

## Release Notes (Draft)

### v1.1 — Stability & Premium

**What's New:**

🔒 **Enhanced Security**

- Certificate pinning protects your connection on all platforms
- Rate limiting guards against API abuse
- Continued security hardening across the board

💎 **Finance Premium**

- Unlimited budgets, goals, and custom reports
- AI-powered categorization (coming in v1.2)
- 14-day free trial — no credit card required
- Easy cancellation anytime from Settings

📊 **Better Insights**

- Contextual financial tips throughout the app
- Improved performance across all platforms

🐛 **Bug Fixes & Improvements**

- Web sync reliability improvements
- Performance optimizations
- Various stability improvements

---

## Dependencies Map

```
#764 (Analytics) ──→ Conversion funnel measurement
       │
#771 (Production) ──→ Backend stability
       │
#329 (Cert Pinning) ──→ Security baseline
#332 (Rate Limiting) ──→ API protection
       │
#337 (Freemium Gating) ──→ #338 (Premium IAP) ──→ Revenue
       │
#535 (Web Sync) ──→ Web platform parity
#770 (Web Perf) ──→ Web user retention
       │
#766 (Play Store) ──→ Android distribution
#772 (Release Automation) ──→ Faster future releases
```

### Dependency Order (Critical Path)

1. **First:** #764 Analytics + #771 Production provisioning (no dependencies)
2. **Then:** #329 Cert pinning + #332 Rate limiting (backend must be stable)
3. **Then:** #337 Freemium gating (analytics must be instrumented to measure)
4. **Then:** #338 Premium IAP (requires freemium gating to define Premium features)
5. **Parallel:** #535, #770, #766, #772 (independent of monetization chain)

---

## Post-v1.1 Outlook (v1.2 Preview)

v1.2 (Sprints 8–10) will focus on:

- **Sprint 8:** Platform widgets, i18n framework, growth levers
- **Sprint 9:** AI features (categorization, NLP, anomaly detection)
- **Sprint 10:** Bank connections, receipt scanning, family plans

The v1.1 analytics foundation will directly inform v1.2 prioritization through real user data.
