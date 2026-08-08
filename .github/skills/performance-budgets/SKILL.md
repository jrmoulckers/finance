---
name: performance-budgets
description: >
  Performance budget guidance. Use for topics related to Lighthouse, Core Web
  Vitals, LCP, INP, CLS, TBT, bundle budgets, lazy chunks, route budgets,
  startup performance, service workers, or performance regression triage.
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Performance Budgets Skill

**Trigger:** slow routes, Core Web Vitals, bundle growth, startup regressions, jank,
Lighthouse failures, budget waivers.
**Inputs:** failing route/surface, metric, actual value, budget value, build artifact or trace.
**Related:** `ux-testing` (perceived latency), `accessibility-testing` (reduced motion/a11y gate),
`design-tokens` (token output size), `issue-management` (scoped regression issues).

## Out of scope

- General UX bug discovery → use `ux-testing`.
- Accessibility audits → use `accessibility-testing`.
- Backend query/index tuning unless the issue is user-perceived latency.
- CI dispatch or merge operations → use the relevant workflow skill.

## Budget model

| Budget | Typical signal |
| --- | --- |
| Route metric | LCP, INP, CLS, TBT, startup/render time |
| Bundle size | initial JS/CSS, lazy chunks, images/fonts, generated assets |
| Runtime | long tasks, hydration, memory, animation jank |
| Network | request count, cache misses, service-worker behavior |

## Method

1. **Identify the failure type** — route metric, bundle size, resource count, startup, or runtime jank.
2. **Use product budgets** — compare actual values to the product's configured thresholds.
3. **Attribute cost** — isolate the dependency, route split, asset, render path, cache behavior, or data load.
4. **Prefer deferral** — lazy-load non-critical flows and keep first paint focused on the primary task.
5. **Protect UX** — do not remove labels, skeletons, security checks, or accessibility affordances solely for speed.
6. **Document waivers** — make exceptions narrow, dated, issue-linked, and reviewed; never raise global budgets silently.

## Acceptance criteria

- Regression report names route/surface, metric, actual, budget, reproduction, and likely owner path.
- Bundle increases justify new dependencies and confirm route-splitting where possible.
- Fixes include the smallest relevant validation: build artifact, Lighthouse/trace, test, or before/after measurement.

## Checklist

Apply [`WEB_CHECKLIST.md`](./WEB_CHECKLIST.md) when triaging or signing off web performance-budget changes.

## Safety

Report budget failures with evidence. Avoid broad threshold changes unless the product owner accepts the
trade-off in an issue or ADR.

## Output

A scoped performance-budget report or issue with measurements, attribution, fix path, validation evidence,
and any explicit waiver.
