---
name: performance-budgets
description: >
  Performance budget guidance for the Finance app. Use for topics related to
  Lighthouse, Core Web Vitals, LCP, INP, CLS, TBT, bundle budgets, lazy chunks,
  route budgets, startup performance, service workers, or performance
  regression triage.
---

# Performance Budgets Skill

## Purpose

This skill covers **performance budget definition, regression triage, and acceptance criteria** for Finance, with emphasis on the Web PWA and cross-platform startup/sync responsiveness.

## Out of Scope

- General UX bug discovery → use `ux-testing`.
- Accessibility scoring and assistive-technology validation → use `accessibility-testing`.
- CI dispatch/merge operations → use `fleet-orchestration`.
- Backend query/index tuning → use `supabase-powersync` unless the issue is client-perceived latency.

## Related Skills

| Skill                   | Use For                                             |
| ----------------------- | --------------------------------------------------- |
| `ux-testing`            | Manual perception of loading, transitions, and jank |
| `accessibility-testing` | Reduced motion and accessibility Lighthouse gate    |
| `web-engineer`          | React/Vite implementation fixes                     |
| `supabase-powersync`    | Backend indexes, RLS, and server query latency      |

## Repo-Specific Budgets and Tools

| Asset / Tool                                        | Purpose                                                        |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `apps/web/performance.budget.json`                  | Route and bundle budget source (`/dashboard`, `/transactions`) |
| `apps/web/lighthouserc.json`                        | Lighthouse CI thresholds (`performance >= 0.90`, a11y >= 0.95) |
| `apps/web/lighthouserc-budget.json`                 | Lighthouse performance-budget assertion                        |
| `apps/web/src/lib/perf/lighthouse-route-budgets.ts` | Route fixture and metric evaluation helpers                    |
| `tools/check-web-performance-budget.mjs`            | Bundle/route budget checker used by `apps/web` `perf:budget`   |

## Current Web Budget Targets

| Metric / Budget     | Target                                             |
| ------------------- | -------------------------------------------------- |
| LCP                 | ≤ 2,500 ms per budgeted route                      |
| INP                 | ≤ 200 ms per budgeted route                        |
| CLS                 | ≤ 0.1 per budgeted route                           |
| TBT                 | ≤ 200 ms in `performance.budget.json` route config |
| Initial JS gzip     | ≤ 184,320 bytes                                    |
| Lazy chunk gzip     | ≤ 215,000 bytes per chunk                          |
| Speculative JS gzip | ≤ 460,800 bytes                                    |

## Regression Triage

1. Identify whether the regression is **route metric**, **bundle size**, **resource count**, or **runtime jank**.
2. Attribute the largest new cost: dependency, route split, chart library, OCR/import code, service worker, or sync hydration.
3. Prefer route-level lazy loading for non-critical flows (import/export, charts, settings subpages).
4. Keep offline-first behavior fast: local reads should paint before sync/network work.
5. If a waiver is unavoidable, make it narrow, dated, and tied to an issue; do not silently raise global budgets.

## Acceptance Criteria

- Regression issues include the failing route, metric, actual value, budget value, and likely owner path.
- Fixes preserve accessibility and privacy; do not remove skeletons, labels, or secure checks solely for speed.
- Bundle increases justify any new dependency and confirm it is route-split where possible.
