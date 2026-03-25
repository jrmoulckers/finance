# Production Deployment Runbook

This runbook describes the steps for deploying the Finance monorepo to production.

## Prerequisites

- Ensure all secrets are configured (GitHub Actions, cloud secret managers, Fastlane Match).
- All migrations must be reviewed and approved.

## Environment Setup

- Use the documented environment variables and secrets.
- Validate build and runtime environments for all platforms.

## Build Steps

- Run `npm run build` (Turborepo) for all apps and packages.
- Use Fastlane for mobile builds.
- Build web and desktop apps as per platform instructions.

## Database Migrations

- Apply migrations using the approved tool (SQLDelight, Supabase CLI, etc.).
- Always backup before applying migrations.

## Smoke Tests

- Run smoke tests for web, mobile, and API endpoints.
- Validate critical user flows and sync.

## Rollback

- Revert the deployment commit and re-run the workflow.
- For database, use migration tool rollback.

## Monitoring & Handoff

- Ensure monitoring (APM, error/crash reporting) is active.
- Handoff to on-call/operations contact.

---

For platform-specific steps, see the respective app deployment guides.
