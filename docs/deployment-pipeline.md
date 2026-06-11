# Deployment Pipeline — Operations Guide

> **Issue:** #886  
> **Workflows:** `deploy-staging.yml`, `deploy-production.yml`

## Architecture

```
green main commit
  → deploy-staging.yml (auto)
    → Affected detection (web / backend)
    → Deploy to staging environment
    → Post-deploy smoke tests
    → Deployment summary

successful staging workflow_run
  → deploy-promote-production.yml (auto)
    → deploy-production.yml (reusable)
      → Version resolution (SHA or tag)
      → Deploy to production
      → Post-deploy smoke tests
      → Auto-rollback on smoke failure
      → GitHub Release + changelog

Manual trigger (workflow_dispatch)
  → deploy-production.yml
    → Escape-hatch deploy / rollback
```

## Environments

| Environment | Trigger                                                                 | Approval               | URL                                       |
| ----------- | ----------------------------------------------------------------------- | ---------------------- | ----------------------------------------- |
| Staging     | Auto on the latest green `main` commit                                  | None                   | `https://finance-staging.jrmoulckers.com` |
| Production  | Auto after successful staging smoke tests, plus manual/tag escape hatch | Required (1+ reviewer) | `https://finance.jrmoulckers.com`         |

## Staging Deployment

**Automatic** — runs on every push to `main` that changes app/service code.

Only affected components are deployed:

- `apps/web/**` or `packages/design-tokens/**` → Web deploy
- `services/**` or `deploy/**` → Backend deploy

Manual re-deploy: **Actions → Deploy — Staging → Run workflow**

## Production Deployment

**Manual** — requires explicit trigger and human approval.

1. Go to **Actions → Deploy — Production → Run workflow**
2. Fill in:
   - **Version**: Git tag (e.g., `v1.0.0`) or commit SHA
   - **Component**: `all`, `web`, or `backend`
   - **Rollback**: Check if rolling back to a previous version
   - **Reason**: Why this deployment is being done
3. Click **Run workflow**
4. A reviewer must approve in the `production` environment

## Rollback Procedure

1. Go to **Actions → Deploy — Production → Run workflow**
2. Enter the **previous known-good version** (tag or SHA)
3. Check **Rollback** (skips smoke tests for speed)
4. Enter reason: "Rollback from vX.Y.Z due to [issue]"
5. Approve and monitor

## Required GitHub Secrets

### Vercel (Web Deployment)

| Secret              | Description                 |
| ------------------- | --------------------------- |
| `VERCEL_TOKEN`      | Vercel API token            |
| `VERCEL_ORG_ID`     | Vercel organization/team ID |
| `VERCEL_PROJECT_ID` | Vercel project ID           |

### Staging Server (Backend)

Scoped to the `staging` GitHub Environment:

| Secret                | Description                                 |
| --------------------- | ------------------------------------------- |
| `DEPLOY_HOST`         | Staging server hostname                     |
| `DEPLOY_SSH_KEY`      | SSH private key for staging                 |
| `DEPLOY_USER`         | SSH username for staging                    |
| `SUPABASE_URL`        | Supabase URL (e.g. `https://staging...`)    |
| `SUPABASE_ANON_KEY`   | Supabase anon key                           |
| `POWERSYNC_URL`       | PowerSync URL                               |
| `BETA_ALLOWED_EMAILS` | Optional comma-separated web beta allowlist |

### Production Server (Backend)

Scoped to the `production` GitHub Environment:

| Secret              | Description                                 |
| ------------------- | ------------------------------------------- |
| `DEPLOY_HOST`       | Production server hostname                  |
| `DEPLOY_SSH_KEY`    | SSH private key for production              |
| `DEPLOY_USER`       | SSH username for production                 |
| `SUPABASE_URL`      | Supabase URL (e.g. `https://finance.ex...`) |
| `SUPABASE_ANON_KEY` | Supabase anon key                           |
| `POWERSYNC_URL`     | PowerSync URL                               |

## GitHub Environment Setup

### Staging Environment

1. Go to **Settings → Environments → New environment**
2. Name: `staging`
3. No protection rules needed (auto-deploy)

### Production Environment

1. Go to **Settings → Environments → New environment**
2. Name: `production`
3. **Required reviewers**: Add at least 1 team member
4. **Deployment branches**: Restrict to `main`
5. **Wait timer**: Optional (e.g., 5 minutes for cool-down)

## Audit Trail

Every production deployment records:

- Version and commit SHA
- Components deployed
- Whether it was a rollback
- Deployment reason
- Who triggered it
- Timestamp

This information is available in the workflow run summary.
