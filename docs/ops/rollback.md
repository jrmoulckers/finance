# Production Rollback Runbook

## Workflow rollback semantics

- `.github/workflows/deploy-production.yml` (`Deploy — Production`) is the fastest web/backend rollback path. It accepts `version`, `component`, `rollback`, and `reason`; the `prepare` job first resolves `version` with `git rev-parse`. If the ref cannot be resolved, the run fails before production environment jobs, build, SSH, or Vercel steps. When `rollback=true`, the workflow skips `smoke-tests`; `deploy-web` and/or `deploy-backend` then redeploy the resolved tag/SHA to production.
- `.github/workflows/rollback.yml` (`Rollback`) is the dedicated cross-platform rollback workflow. It requires production environment approval, then runs platform-specific rollback jobs for `android`, `ios`, `web`, `windows`, or `all`, followed by a tracking issue/checklist. Many store/provider commands are documented as production placeholders and still require operator follow-through.
- `.github/workflows/staged-rollout.yml` (`Staged Rollout`) progressively advances Android/iOS/web/Windows to 10%, 25%, 50%, and 100% after monitoring and approval gates. It does not execute rollback itself; stage summaries instruct operators to trigger the dedicated `Rollback` workflow if monitoring or issues fail.
- `.github/workflows/canary-deploy.yml` (`Canary Deploy`) deploys a canary, monitors health, promotes to production when healthy, and automatically runs `Rollback Canary` when monitoring recommends rollback. Canary rollback stops canary traffic/containers and asks the operator to verify stable production is handling all traffic.

## When to roll back

- Sev1: site down, data corruption, auth broken
- Sev2: severe regression affecting >10% of users (degrade first if possible)
- Sev3: bug — prefer hotfix forward unless rollback faster

## Decision tree

1. Is this a web-only regression? → web rollback (fastest, < 5 min)
2. Backend regression? → backend rollback
3. Mobile (iOS/Android/Windows store) regression? → halt rollout, then full rollback
4. Cross-component? → coordinated multi-step

## Web rollback (Azure VM)

**Trigger**: GitHub Actions → "Deploy — Production" → Run workflow

- version: last known-good tag (e.g., `v1.2.2`)
- component: `web` (or `all` if backend also affected)
- rollback: `true` ← THIS skips smoke tests
- reason: e.g., "Rollback: PII leak in transaction list #2099"

**Verify**: open <https://finance.jrmoulckers.com>, check version footer matches the rolled-back tag.

## Backend rollback

**Trigger**: GitHub Actions → "Deploy — Production" → Run workflow

- version: last known-good tag or commit SHA
- component: `backend` (or `all` for coordinated web/backend rollback)
- rollback: `true` ← skips pre-deploy smoke tests
- reason: include incident number, impact, and rollback target

**What happens**: the workflow resolves the version in `prepare`, then checks out that SHA on the production server over SSH, runs `docker compose -f deploy/docker-compose.yml pull`, and recreates services with `docker compose -f deploy/docker-compose.yml up -d --remove-orphans`. Caddy is explicitly started/retried so public traffic can recover while healthchecks settle.

**Verify**:

1. Confirm the GitHub Actions run completed successfully for `deploy-backend`.
2. Check the deployment summary for the resolved version and host.
3. Verify `https://finance.jrmoulckers.com/api/health` (or the current production health endpoint) returns healthy.
4. Confirm backend logs and error-rate dashboards recover for at least 15 minutes.

**Fallback**: use GitHub Actions → "Rollback" for a production-approved rollback record when the incident spans platforms or needs the dedicated rollback issue/checklist. Select `platform=web`, `windows`, `android`, `ios`, or `all`; provide the broken `current_version`, good `rollback_version`, severity, and audit reason.

## Mobile rollbacks

### iOS (App Store / TestFlight)

- TestFlight: expire the bad build via App Store Connect → TestFlight → Builds → Expire
- App Store: Phased Release — pause the rollout in App Store Connect
- Full pull: Submit a new build with previous binary; cannot truly "rollback" published versions
- If using the `Rollback` workflow, select `platform=ios`; for P0 it documents remove-from-sale and always records manual expedited-review follow-up.

### Android (Play Store)

- Play Console → Production track → Halt staged rollout
- Or set rollout percentage to 0%
- Or upload previous APK/AAB as a new version (bump `versionCode`)
- If using the `Rollback` workflow, select `platform=android`; it records halt/promote actions and post-rollback checklist items.

### Windows (Store)

- Partner Center → Submission → Halt distribution
- Or roll forward with hotfix
- If using the `Rollback` workflow, select `platform=windows`; it documents reverting the auto-update manifest or submitting the previous version to Microsoft Store.

## Canary rollback

Use `Canary Deploy` for pre-production traffic validation. The workflow resolves the target version before any canary deploy, routes the configured percentage to canary, monitors health, and either promotes to production or runs `Rollback Canary` automatically. If rollback runs, verify all traffic is back on the stable deployment and stop any remaining canary resources manually if the workflow reports missing canary credentials.

## Staged rollout rollback

For Android/iOS/web/Windows staged releases, use `Staged Rollout` only to advance healthy stages. If stage monitoring finds P0/P1 issues, crash-free rate drops, or support channels report severe regression, stop advancing the stage and trigger `Rollback` for the affected platform. For mobile stores, halt/pause the staged rollout in the store console before attempting any full rollback or hotfix-forward.

## After rollback

- File incident report in `docs/incidents/YYYY-MM-DD-<slug>.md`
- Update on-call rotation schedule if needed
- Schedule post-mortem within 48h
- Keep monitoring error rate, auth success, and payment/transaction flows until metrics are stable for at least 1 hour
- Open or update a tracking issue with root cause, rollback version, forward-fix owner, and customer communication status

## Validation log

| Date       | Type                                | Triggered by | Outcome                                                                                                                                                   | Run                                                                            |
| ---------- | ----------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 2026-06-10 | Dry-run (main baseline)             | Copilot      | Unexpected: invalid version passed `prepare` and reached production approval; approval was rejected and the run was cancelled before production steps ran | [27282796603](https://github.com/jrmoulckers/finance/actions/runs/27282796603) |
| 2026-06-10 | Dry-run (PR branch after hardening) | Copilot      | Failed-as-expected at `prepare` version resolve with `Could not resolve`; production deploy jobs were skipped                                             | [27283195075](https://github.com/jrmoulckers/finance/actions/runs/27283195075) |
