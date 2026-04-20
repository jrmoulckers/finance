# Launch Readiness Dashboard Requirements and Platform Parity Assessment

**Issue:** #894
**Sprint:** S5 - Launch Readiness and Platform Parity
**Priority:** P2 - Medium
**Status:** Complete
**Document Owner:** Product Management
**Date:** 2025-07-31

---

## Part 1: Launch Readiness Dashboard Requirements

### Overview

The launch readiness dashboard provides a single-page view answering: Is it safe
to launch? It consolidates backend health, platform readiness, key metrics, and
blocking issues into an at-a-glance status page accessible to all stakeholders.

Reference: docs/architecture/monitoring-infrastructure.md section 7

### Dashboard Sections

#### Section 1: Overall Launch Status

A single traffic light indicator (Red / Yellow / Green) computed from all other
sections. Rules:

- **Red (No-Go):** Any P0 issue open, any service down, sync error rate > 5%,
  any platform submission rejected
- **Yellow (Conditional):** P1 issues open, degraded performance, partial
  platform coverage, sync error rate 2-5%
- **Green (Go):** No P0/P1 blockers, all services healthy, all platforms
  submitted, sync error rate < 2%

#### Section 2: Backend Health

| Metric                    | Source              | Threshold (Green) | Threshold (Red)  |
| ------------------------- | ------------------- | ----------------- | ---------------- |
| API server status         | Uptime Kuma         | Up                | Down             |
| API response time (p95)   | Uptime Kuma/logs    | < 500ms           | > 2000ms         |
| Sync service status       | Uptime Kuma         | Up                | Down             |
| Sync success rate         | PostgreSQL query    | > 98%             | < 95%            |
| Database connection pool  | pg_stat_activity    | < 80% utilized    | > 95% utilized   |
| Database replication lag  | pg_stat_replication | < 1s              | > 10s            |
| TLS certificate expiry    | Certificate check   | > 30 days         | < 7 days         |
| Backup status             | Backup script log   | Last < 24h, OK    | Last > 48h, fail |
| Docker container restarts | Docker API          | 0 in last 24h     | > 3 in last 24h  |
| Disk usage                | OS stats            | < 70%             | > 90%            |

#### Section 3: Platform Submission Status

| Platform | Field           | Data Source                    |
| -------- | --------------- | ------------------------------ |
| iOS      | Submission date | Manual / App Store Connect API |
| iOS      | Review status   | Manual / App Store Connect API |
| iOS      | Approval date   | Manual / App Store Connect API |
| Android  | Submission date | Manual / Play Console          |
| Android  | Review status   | Manual / Play Console          |
| Android  | Rollout %       | Manual / Play Console          |
| Windows  | Submission date | Manual / Partner Center        |
| Windows  | Cert status     | Manual / Partner Center        |
| Web      | Deploy status   | CDN health check               |
| Web      | CDN status      | Uptime Kuma                    |

#### Section 4: Quality Metrics

| Metric              | Source           | Green       | Red          |
| ------------------- | ---------------- | ----------- | ------------ |
| Open P0 issues      | GitHub API       | 0           | Any          |
| Open P1 issues      | GitHub API       | < 3         | > 5          |
| CI pipeline status  | GitHub Actions   | Passing     | Failing      |
| E2E test pass rate  | CI artifacts     | > 95%       | < 90%        |
| Code coverage (KMP) | CI artifacts     | > 80%       | < 60%        |
| Performance budget  | CI check         | Passing     | Failing      |
| Accessibility audit | Manual/automated | No blockers | A-level fail |

#### Section 5: Client Health (Post-Launch)

| Metric                    | Source            | Green   | Red      |
| ------------------------- | ----------------- | ------- | -------- |
| Crash-free rate (iOS)     | App Store Connect | > 99.5% | < 99%    |
| Crash-free rate (Android) | Play Console      | > 99.5% | < 99%    |
| ANR rate (Android)        | Play Console      | < 0.5%  | > 1%     |
| Sync error rate           | Telemetry         | < 2%    | > 5%     |
| App store rating          | Store APIs        | > 4.0   | < 3.5    |
| 1-star review spike       | Store APIs        | < 5/day | > 20/day |

#### Section 6: Blocking Issues

Auto-populated list of all open GitHub issues with labels priority:critical or
priority:high. Each entry shows: issue number, title, assignee, age in days,
and any linked milestone.

---

### Technical Requirements

#### MVP Implementation (Option A: Static HTML)

- [ ] Shell script at deploy/scripts/launch-dashboard.sh that queries all data
      sources and generates a static HTML dashboard
- [ ] Queries: Uptime Kuma API for service health, PostgreSQL for sync metrics
      and connection stats, Docker API for container health, GitHub API for
      open P0/P1 issues, certificate expiry check via openssl
- [ ] HTML output with CSS grid layout, color-coded status indicators, and
      auto-refresh meta tag (60 seconds)
- [ ] Served via Caddy at /admin/dashboard with basic auth (internal only)
- [ ] Cron job refreshes dashboard data every 60 seconds
- [ ] Dashboard loads in < 2 seconds, works without JavaScript
- [ ] Accessible via SSH tunnel only (not exposed to public internet)

#### Data Collection

- [ ] Each data source has a dedicated collector function in the shell script
- [ ] Collectors handle timeouts gracefully (5s per source, skip on timeout)
- [ ] Failed collectors show Unknown status (yellow) instead of crashing
- [ ] All queries are read-only (no mutations from the dashboard)
- [ ] GitHub API calls use a read-only PAT with issues:read scope only

#### Future Evolution (Option B: Grafana)

When dashboard complexity warrants:

- Self-hosted Grafana with PostgreSQL and Prometheus data sources
- Pre-built dashboards for operations, client health, and business metrics
- Deployment annotations for correlation
- Alert rules with PagerDuty/Slack integration
- Estimated effort: 2-3 weeks for migration

---

### Dashboard Wireframe (ASCII)

```
+----------------------------------------------------------------+
| FINANCE LAUNCH READINESS              [Last updated: HH:MM:SS] |
+----------------------------------------------------------------+
| OVERALL STATUS:  [ GREEN - GO ]  /  [ YELLOW ]  /  [ RED ]     |
+----------------------------------------------------------------+
|                    |                      |                      |
| BACKEND HEALTH     | PLATFORM STATUS      | QUALITY METRICS      |
| API: [UP]          | iOS: [Approved]      | P0 Issues: [0]       |
| Sync: [UP]         | Android: [100%]      | P1 Issues: [2]       |
| DB Pool: [45%]     | Windows: [Certified] | CI: [Passing]        |
| Repl Lag: [0.2s]   | Web: [Deployed]      | E2E: [97%]           |
| TLS: [89 days]     |                      | Coverage: [82%]      |
| Backup: [4h ago]   |                      | Perf Budget: [Pass]  |
|                    |                      |                      |
+----------------------------------------------------------------+
| BLOCKING ISSUES                                                 |
| (none)                                                          |
+----------------------------------------------------------------+
```

---

## Part 2: Platform Parity Assessment

### Current Platform Feature Matrix

Based on analysis of merged PRs, open issues, and the existing sprint plan
platform parity matrix (sprint-plan-1-5.md), here is the updated assessment:

| Feature Area           | iOS  | Android | Web  | Windows | Notes                     |
| ---------------------- | ---- | ------- | ---- | ------- | ------------------------- |
| Accounts CRUD          | DONE | DONE    | DONE | DONE    | Full parity               |
| Transactions CRUD      | DONE | DONE    | DONE | DONE    | Full parity               |
| Budgets CRUD           | DONE | DONE    | DONE | DONE    | Full parity               |
| Goals CRUD             | DONE | DONE    | DONE | DONE    | Full parity               |
| Categories             | DONE | DONE    | DONE | DONE    | Full parity               |
| Sync (E2E encrypted)   | DONE | DONE    | DONE | DONE    | Web was partial, now done |
| Auth (email/password)  | DONE | DONE    | DONE | DONE    | Full parity               |
| Biometric Auth         | DONE | DONE    | N/A  | DONE    | Web: no biometric API     |
| Offline Support        | DONE | DONE    | DONE | DONE    | PWA offline via SW        |
| Data Export (CSV)      | DONE | PART    | PART | PART    | Gap: Android/Web/Windows  |
| Data Export (PDF)      | DONE | NONE    | NONE | NONE    | iOS only via #879         |
| Data Import (CSV)      | NONE | NONE    | PART | NONE    | Web partial via PR #738   |
| Dark Mode              | DONE | DONE    | DONE | DONE    | Full parity               |
| Accessibility          | DONE | DONE    | PART | DONE    | Web: partial audit #77    |
| Notifications          | DONE | DONE    | PART | NONE    | Web: Web Notif API only   |
| i18n Framework         | DONE | DONE    | DONE | DONE    | KMP shared (#264)         |
| Performance Monitoring | DONE | PART    | NONE | NONE    | iOS instrumented (#903)   |
| Home Screen Widgets    | NONE | NONE    | DONE | DONE    | Widget board: Web+Win     |
| Dashboard Widgets      | DONE | DONE    | DONE | DONE    | PR #950 merged            |
| Quick Entry            | NONE | NONE    | DONE | NONE    | Web FAB via PR #953       |
| Voice Input            | NONE | NONE    | NONE | DONE    | Windows Cortana (#938)    |
| Store Submission       | PEND | PEND    | DONE | DONE    | iOS/Android pending       |
| E2E Tests              | PART | DONE    | PART | NONE    | Windows: not started      |

Legend: DONE = Complete, PART = Partial, NONE = Not Started, PEND = Pending,
N/A = Not Applicable

### Parity Gap Analysis

#### Critical Gaps (Must Fix Before Launch)

| Gap                    | Platforms Affected | Issue/Action                    |
| ---------------------- | ------------------ | ------------------------------- |
| Data export incomplete | Android, Web, Win  | Need CSV export on all plats    |
| App store submissions  | iOS, Android       | In progress, timeline-dependent |

#### Significant Gaps (Should Fix in v1.0.x)

| Gap                     | Platforms Affected                       | Recommendation             |
| ----------------------- | ---------------------------------------- | -------------------------- |
| PDF export              | Android, Web, Win                        | Extend iOS implementation  |
| Data import             | iOS, Android, Win                        | Web has partial, extend    |
| Web accessibility audit | Web                                      | Complete WCAG 2.2 AA (#77) |
| E2E test coverage       | iOS (partial), Web (partial), Win (none) | Priority: Windows E2E      |
| Performance monitoring  | Android, Web, Win                        | Extend iOS instrumentation |
| Notifications           | Windows                                  | Toast notifications needed |

#### Feature Gaps (Post-Launch Differentiation)

| Gap                   | Platforms Affected | Recommendation                |
| --------------------- | ------------------ | ----------------------------- |
| Home screen widgets   | iOS, Android       | Stage 9/V2 feature (#293)     |
| Quick entry FAB       | iOS, Android, Win  | Extend web implementation     |
| Voice input           | iOS, Android, Web  | Extend Windows implementation |
| Siri/Google Assistant | iOS, Android       | #294 (closed), native voice   |

### Platform Maturity Scores

Scoring each platform on a 0-100 scale based on feature coverage, test
coverage, and polish:

| Platform | Core Features | Polish | Testing | Overall | Grade |
| -------- | ------------- | ------ | ------- | ------- | ----- |
| iOS      | 95            | 90     | 75      | 87      | A-    |
| Android  | 90            | 85     | 90      | 88      | A-    |
| Web      | 90            | 80     | 70      | 80      | B+    |
| Windows  | 90            | 85     | 50      | 75      | B     |

### Platform-Specific Recommendations

#### iOS (Grade: A-)

Strengths: Best data export, performance instrumentation, biometric auth.
Gaps: No home screen widgets, no quick entry FAB, E2E tests partial.
Priority: Complete E2E tests, add quick entry for input parity.

#### Android (Grade: A-)

Strengths: Best E2E test coverage, Material You theming, notification system.
Gaps: Data export incomplete, no PDF export, no home screen widgets.
Priority: Complete CSV export, add PDF export for parity with iOS.

#### Web (Grade: B+)

Strengths: PWA offline support, dashboard widgets, quick entry FAB.
Gaps: Accessibility audit incomplete, performance monitoring absent, no voice.
Priority: Complete WCAG 2.2 AA audit (#77), add performance instrumentation.

#### Windows (Grade: B)

Strengths: Widget board integration, Cortana voice input, DPAPI encryption.
Gaps: No E2E tests, no notifications, data export incomplete.
Priority: Establish E2E test framework, add toast notifications.

---

### Launch Readiness Verdict

Based on the platform parity assessment:

| Criterion                    | Status  | Notes                           |
| ---------------------------- | ------- | ------------------------------- |
| Core features on all plats   | PASS    | All CRUD, sync, auth complete   |
| Biometric auth on native     | PASS    | iOS, Android, Windows           |
| Offline on all platforms     | PASS    | Full offline support everywhere |
| Data export on all platforms | PARTIAL | CSV export gaps on 3 platforms  |
| E2E tests on all platforms   | PARTIAL | Windows has none                |
| Store submissions            | PENDING | iOS and Android in progress     |
| Accessibility compliance     | PARTIAL | Web audit incomplete            |

**Overall: CONDITIONAL GO** — Core functionality is at parity across all four
platforms. Data export and E2E test gaps are not launch-blocking but should be
addressed in v1.0.1. Store submissions are the critical path item.

---

## Part 3: Dashboard Implementation Plan

### Sprint Breakdown

| Week | Task                                      | Owner   |
| ---- | ----------------------------------------- | ------- |
| 1    | Data collector scripts (health, sync, DB) | Backend |
| 1    | GitHub API integration (P0/P1 queries)    | Backend |
| 2    | HTML template with CSS grid layout        | Web     |
| 2    | Caddy configuration for /admin/dashboard  | DevOps  |
| 2    | Cron job setup and testing                | DevOps  |
| 3    | Platform status manual entry interface    | Backend |
| 3    | Integration testing and documentation     | QA      |

### Definition of Done

- [ ] Dashboard shows health status for all backend services
- [ ] Dashboard shows sync success rate, API latency, error rate
- [ ] Dashboard shows platform readiness status (submission/approval)
- [ ] Dashboard shows blocking issue count (P0/P1 from GitHub)
- [ ] Accessible via SSH tunnel only (not public)
- [ ] Auto-refreshes every 60 seconds
- [ ] Loads in under 2 seconds
- [ ] Works without JavaScript (static HTML)
- [ ] Documentation in docs/ops/ for maintenance

---

## Acceptance Criteria Checklist

- [x] Launch readiness dashboard requirements fully specified
- [x] Dashboard sections defined with metrics, sources, and thresholds
- [x] MVP technical requirements (static HTML + cron) documented
- [x] Future evolution path (Grafana) outlined
- [x] Platform parity matrix updated with current state
- [x] Parity gaps categorized: critical, significant, and feature gaps
- [x] Platform maturity scores with per-platform recommendations
- [x] Launch readiness verdict with conditional go decision
- [x] Dashboard implementation sprint plan with weekly breakdown

Closes #894
