# Deployment Runbook

> Single source of truth for Finance deployments. This consolidates the active deploy workflows, the [secrets audit](./secrets.md), the [rollback runbook](./rollback.md), and the [supply-chain policy](../security/supply-chain.md).

## Environment overview

| Environment   | Purpose                             | Trigger                                                                                    | Approval                                 | Notes                                                                                                                       |
| ------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `development` | Local dev and feature-branch work   | Manual/local only                                                                          | None                                     | No audited workflow currently deploys to the `development` GitHub Environment.                                              |
| `preview`     | PR validation for web changes       | `pull_request` on `apps/web/**` or `packages/**`                                           | None                                     | Vercel preview deploys plus Lighthouse/PR feedback.                                                                         |
| `staging`     | Pre-production validation on `main` | Auto on push to `main` when `apps/**`, `packages/**`, `services/**`, or `deploy/**` change | None by default                          | Deploys the exact merged SHA after waiting for required CI. Manual reruns exist for recovery.                               |
| `production`  | Live release                        | Auto promotion from successful staging, semver tag push (`v*`), or manual dispatch         | GitHub `production` environment approval | Non-rollback deploys require CI green, post-deploy smoke tests, and automated promotions can auto-rollback/create releases. |

Deployment flow is:

```text
feature/local dev -> preview -> staging -> production
```

## Staging deploys

Workflow: `.github/workflows/deploy-staging.yml` (`Deploy — Staging`)

- Triggers automatically on push to `main` when app, package, service, or deploy files change.
- Supports manual `workflow_dispatch` reruns.
- Manual reruns accept `skip_ci_gate`; this is an emergency-only override for staging recovery when required CI is unavailable.
- `pre-deploy-checks` detects whether web and/or backend changed so unchanged components are skipped.
- Normal runs wait for these checks on the exact deploy SHA: `Web CI`, `Android CI`, `iOS CI`, `Windows CI`, `Lint & Format`, `CI — Shared Packages`, and `Security Scanning`.
- Backend staging deploys over SSH to the staging host, runs `git pull origin main`, refreshes Docker Compose services, and restarts Caddy if needed.
- Web staging deploys over SSH to the same host, hard-resets to `origin/main`, runs `npm ci`, rebuilds `packages/design-tokens` and `apps/web`, and verifies the built env.
- The web job is serialized after the backend job to avoid `.git` lock races on the shared VM checkout.

## Production deploys

Workflow: `.github/workflows/deploy-production.yml` (`Deploy — Production`)

### Triggers

- **Automated promotion:** `.github/workflows/promote-production.yml` listens for a successful `Deploy — Staging` run on `main`, then reuses `deploy-production.yml` to promote the exact staged SHA.
- **Tag push:** any global semver tag matching `v*` (for example `v1.2.3` or `v1.2.3-rc.1`) triggers an automatic production deploy of **all** components.
- **Manual dispatch:** operators can provide:
  - `version`: semver tag or commit SHA
  - `component`: `all`, `web`, or `backend`
  - `rollback`: `true`/`false`
  - `reason`: required audit-trail text

### Gates and flow

1. `prepare` resolves the requested version with `git rev-parse` and fails fast if the ref cannot be resolved.
2. Non-rollback deploys wait for the same required CI checks on the resolved SHA.
3. Non-rollback deploys run pre-deploy smoke tests against the exact target revision.
4. Protected jobs use the GitHub `production` environment, so release managers must approve before execution continues.
5. Web deploys build `packages/design-tokens` + `apps/web` and publish the built bundle to Vercel.
6. Backend deploys SSH to the production host, `git fetch origin`, `git checkout <resolved sha>`, then run `docker compose ... pull` and `up -d --remove-orphans`.
7. Post-deploy smoke tests verify the production homepage and `/health`; automated promotions roll back to the previous stable tag if those checks fail.
8. Automated promotions create a GitHub Release and changelog after production smoke tests pass.
9. The workflow writes a deployment summary including version, short SHA, components, rollback flag, reason, actor, smoke status, rollback status, and release status.

### Rollback behavior inside the production workflow

- Manual production reruns with `rollback=true` skip the CI wait gate and smoke tests.
- The workflow still resolves the requested tag/SHA before touching production.
- Production environment approval still applies unless an authorized admin temporarily removes the protection rule.

## Rollback procedures

Detailed procedures live in [rollback.md](./rollback.md). Use that file for the full decision tree and validation steps.

Key points:

- For **web/backend incidents**, the fastest path is usually `Deploy — Production` with:
  - `version`: last known-good tag or SHA
  - `component`: `web`, `backend`, or `all`
  - `rollback`: `true`
  - `reason`: incident number, impact, and rollback target
- For **cross-platform or store rollouts**, use `.github/workflows/rollback.yml` for the audited rollback flow and checklist.
- After rollback, verify:
  1. the GitHub Actions run completed successfully,
  2. the public web app is serving the expected version,
  3. `/api/health` is healthy for backend rollbacks,
  4. logs, Sentry, and error-rate dashboards recover for at least 15 minutes.
- After the incident is stable, record follow-up work (incident doc, root cause, forward-fix owner, communications).

## Secret management

The authoritative inventory is [secrets.md](./secrets.md). It currently audits **107 secret/variable names** and flags **16 parity gaps**.

Use these buckets for day-to-day deployment work:

- **Preview**
  - Required: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
  - Optional: `BETA_ALLOWED_EMAILS`
- **Staging**
  - Required for `deploy-staging.yml`: `DEPLOY_HOST`, `DEPLOY_SSH_KEY`, `DEPLOY_USER`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `POWERSYNC_URL`
  - Recommended/optional: `DEPLOY_PATH` (defaults to `~/finance` if absent), `BETA_ALLOWED_EMAILS`, `SENTRY_DSN`
- **Production**
  - Required for `deploy-production.yml`: `DEPLOY_HOST`, `DEPLOY_SSH_KEY`, `DEPLOY_USER`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `POWERSYNC_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
  - Common companion values: `DEPLOY_PATH`, release-signing/store secrets for mobile, and any runtime secrets from `deploy/.env.example`
- **Repo scoped/shared**
  - Built-in: `GITHUB_TOKEN`
  - Shared build secrets: `TURBO_TEAM`, `TURBO_TOKEN`
  - Windows release secrets remain repo-scoped in the audit: `WINDOWS_SIGNING_CERT_BASE64`, `WINDOWS_CERT_PASSWORD`

Before relying on a new environment or recovery path, review the parity gaps in [secrets.md](./secrets.md), especially the preview Vercel gaps, missing staging optional values, and mobile release secrets missing from staging/production.

## Supply-chain security

Policy: [docs/security/supply-chain.md](../security/supply-chain.md)

- Production releases must publish signed in-toto SLSA build provenance for shipped artifacts.
- Any release marked `production` should be treated as incomplete if provenance generation failed.
- Verify artifacts before or during release sign-off with:

```sh
gh attestation verify <artifact> --repo jrmoulckers/finance
```

- Published attestations are visible at <https://github.com/jrmoulckers/finance/attestations>.

## Typical release checklist

1. Prepare the release commit and **bump the version** (Changesets / release-train flow).
2. Merge the release-ready changes to `main` and confirm required CI is green.
3. Let `Deploy — Staging` run automatically from that `main` commit.
4. Monitor staging: deployment summary, web smoke behavior, backend health, logs, and Sentry.
5. When staging is healthy, create and push the semver tag (`vX.Y.Z`) **or** manually dispatch `Deploy — Production` for the exact target SHA/tag.
6. Confirm the production workflow resolved the expected version/SHA and passed the non-rollback gates.
7. Approve the GitHub `production` environment when ready.
8. Monitor production health after deploy and verify SLSA attestation status for shipped artifacts.
9. If a severe regression appears, execute the rollback path immediately and document the incident.

## Emergency procedures

### Hotfix flow

1. Land the smallest safe fix on `main` as quickly as possible.
2. Let staging auto-deploy the hotfix SHA; use manual staging dispatch only if you need a redeploy or CI is temporarily unavailable.
3. Validate the hotfix in staging.
4. Promote by pushing a new hotfix tag (for example `v1.2.4`) or by manually dispatching `Deploy — Production` with the exact hotfix SHA and an audit reason.
5. If customer impact is severe and rollback is faster than forward-fix, roll back first and hotfix second.

### Rollback without CI gate

1. Open **Actions → Deploy — Production → Run workflow**.
2. Enter the last known-good tag or SHA.
3. Set `rollback=true` so CI wait + smoke tests are skipped.
4. Limit `component` to the affected surface when possible.
5. Add the incident/audit reason and run the workflow.
6. Approve the production environment.
7. Verify recovery using the checks summarized above and in [rollback.md](./rollback.md).

### Approval unavailable

If release managers are unavailable during an active incident, a repository admin can temporarily disable the `production` environment protection, complete the emergency deploy or rollback, then immediately restore the protection and document the override in the incident record.
