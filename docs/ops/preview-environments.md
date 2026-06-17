# Preview Environment Setup

This document describes the preview deployment infrastructure for the Finance monorepo web application.

> **Related:** [CI Workflow](ci-workflow.md) | [Monitoring Setup](monitoring-setup.md)

---

## Overview

Every pull request that modifies `apps/web/**` or `packages/**` automatically receives a preview deployment on Vercel, complete with Lighthouse performance audits and automated PR comments.

## How It Works

### Trigger

The `deploy-preview.yml` workflow triggers on:

- Pull requests modifying `apps/web/**` or `packages/**`
- Only runs on `pull_request` events (not pushes to main)

### Pipeline Stages

```
PR opened/updated
  ├─ Build shared packages (Turbo)
  ├─ Build web app (Next.js)
  ├─ Deploy to Vercel (preview)
  ├─ Run Lighthouse CI audit
  ├─ Post PR comment with:
  │   ├─ Preview URL
  │   ├─ Lighthouse scores
  │   └─ Bundle size comparison
  └─ On PR close: cleanup preview
```

### Preview URL Format

Preview URLs follow the Vercel pattern:

```
https://finance-<hash>-<team>.vercel.app
```

## Lighthouse Performance Budgets

Preview deployments are audited against the project performance budget (`performance.budget.json`):

| Metric              | Budget   | Category        |
| ------------------- | -------- | --------------- |
| Performance score   | >= 90    | Core Web Vitals |
| Accessibility score | >= 95    | A11y            |
| Dashboard cold load | < 2000ms | App-specific    |
| SQLite query        | < 100ms  | App-specific    |

### Lighthouse Categories

The audit checks all four Lighthouse categories:

- **Performance**: Core Web Vitals (LCP, FID, CLS)
- **Accessibility**: ARIA, color contrast, keyboard nav
- **Best Practices**: HTTPS, console errors, deprecated APIs
- **SEO**: Meta tags, structured data, mobile-friendly

## PR Comment Format

The workflow posts a formatted comment on each PR with:

1. **Preview URL** — Direct link to the deployed preview
2. **Lighthouse scores** — Color-coded performance metrics
3. **Bundle analysis** — Size comparison vs. main branch
4. **Status** — Pass/fail against performance budgets

## Cleanup

When a PR is closed (merged or abandoned):

- The preview deployment is automatically deactivated
- Vercel removes the preview after its retention period

## Manual Testing on Preview

Before merging, reviewers should verify on the preview URL:

1. **Navigation**: All routes load correctly
2. **Data flow**: Mock data renders in dashboard views
3. **Responsive**: Mobile and tablet breakpoints
4. **Dark mode**: Theme toggle works
5. **Offline**: Service worker caches critical assets

## Troubleshooting

### Preview deployment failed

1. Check the `deploy-preview.yml` workflow run logs
2. Common causes:
   - Build failure in shared packages
   - Vercel project configuration mismatch
   - Environment variable missing (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`)

### Lighthouse scores below budget

1. Review the Lighthouse report in the PR comment
2. Run locally: `npx lhci autorun --config=lighthouserc.json`
3. Common fixes:
   - Lazy-load below-fold components
   - Optimize images (use `next/image`)
   - Reduce JavaScript bundle size
   - Add missing ARIA attributes

### Preview shows stale content

1. Vercel may be serving a cached version
2. Hard refresh (`Ctrl+Shift+R`) the preview URL
3. Check that the correct commit SHA is deployed
