# GitHub Environments & Secrets Configuration

This document defines the GitHub Environments setup for the Finance monorepo,
including environment-specific secrets, approval gates, and deployment patterns.

## Table of Contents

- [Environment Overview](#environment-overview)
- [Environment Configuration](#environment-configuration)
- [Secret Injection Patterns](#secret-injection-patterns)
- [Deployment Approval Gates](#deployment-approval-gates)
- [Workflow Templates](#workflow-templates)
- [Secret Rotation](#secret-rotation)
- [Troubleshooting](#troubleshooting)

## Environment Overview

The Finance monorepo uses three GitHub Environments to control deployment flow:

| Environment   | Purpose                             | Approval             | Branch Restriction  |
| ------------- | ----------------------------------- | -------------------- | ------------------- |
| `development` | Feature branch testing, PR previews | None (auto-deploy)   | Any branch          |
| `staging`     | Pre-release validation, QA testing  | None or 1 reviewer   | `main`, `release/*` |
| `production`  | Live user-facing releases           | 2 required reviewers | `main`, `release/*` |

```
feature branch → [development] → merge to main → [staging] → tag → [production]
```

## Environment Configuration

### development

- **Purpose:** Ephemeral preview deployments for PRs
- **Auto-deploy:** Yes
- **Branch rules:** Any branch
- **Wait timer:** None
- **Use case:** PR preview URLs (Vercel preview, Firebase App Distribution)

### staging

- **Purpose:** Integration testing before production release
- **Auto-deploy:** Yes (on main push) or gated (on manual dispatch)
- **Branch rules:** `main`, `release/*`
- **Wait timer:** None
- **Use case:** TestFlight builds, internal Play Store track, staging web URL

### production

- **Purpose:** End-user-facing releases
- **Auto-deploy:** Never — always requires approval
- **Branch rules:** `main`, `release/*`
- **Required reviewers:** 2 (from `@jrmoulckers/release-managers`)
- **Wait timer:** 5 minutes (cooling-off period after approval)
- **Use case:** App Store, Play Store production, production web deploy

### GitHub Settings Steps

To configure these environments in your GitHub repository:

1. Go to **Settings → Environments**
2. Create each environment (`development`, `staging`, `production`)
3. For `production`:
   - Enable **Required reviewers** and add the release managers team
   - Set **Wait timer** to 5 minutes
   - Under **Deployment branches**, select "Selected branches" and add `main` and `release/*`
4. For `staging`:
   - Under **Deployment branches**, select "Selected branches" and add `main` and `release/*`
5. Add environment-specific secrets as documented below

## Secret Injection Patterns

### Repository-Level Secrets (shared across all environments)

These secrets are used by CI workflows that don't target a specific environment:

| Secret          | Purpose                         | Used By             |
| --------------- | ------------------------------- | ------------------- |
| `TURBO_TOKEN`   | Turborepo remote cache auth     | All build workflows |
| `TURBO_TEAM`    | Turborepo team identifier       | All build workflows |
| `GITHUB_TOKEN`  | Auto-provided by GitHub Actions | All workflows       |
| `CODECOV_TOKEN` | Coverage upload token           | CI workflows        |

### Environment-Level Secrets

Secrets scoped to specific environments are only available when a job references
that environment via the `environment:` key.

#### staging

| Secret                            | Platform | Purpose                                 |
| --------------------------------- | -------- | --------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`         | Android  | Debug/staging signing keystore (Base64) |
| `ANDROID_KEYSTORE_PASSWORD`       | Android  | Keystore password                       |
| `ANDROID_KEY_ALIAS`               | Android  | Key alias                               |
| `ANDROID_KEY_PASSWORD`            | Android  | Key password                            |
| `IOS_DISTRIBUTION_CERT_BASE64`    | iOS      | Ad-hoc/development distribution cert    |
| `IOS_CERT_PASSWORD`               | iOS      | Certificate password                    |
| `IOS_PROVISIONING_PROFILE_BASE64` | iOS      | Development provisioning profile        |
| `APP_STORE_API_KEY_ID`            | iOS      | App Store Connect API key (TestFlight)  |
| `APP_STORE_API_ISSUER`            | iOS      | App Store Connect issuer                |
| `VERCEL_TOKEN`                    | Web      | Vercel staging deployment token         |
| `VERCEL_ORG_ID`                   | Web      | Vercel organization ID                  |
| `VERCEL_PROJECT_ID`               | Web      | Vercel project ID                       |
| `SUPABASE_URL`                    | Backend  | Staging Supabase URL                    |
| `SUPABASE_ANON_KEY`               | Backend  | Staging Supabase anon key               |

#### production

All staging secrets are duplicated with production-specific values, plus:

| Secret                            | Platform | Purpose                                |
| --------------------------------- | -------- | -------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`         | Android  | Production signing keystore (Base64)   |
| `ANDROID_KEYSTORE_PASSWORD`       | Android  | Production keystore password           |
| `ANDROID_KEY_ALIAS`               | Android  | Production key alias                   |
| `ANDROID_KEY_PASSWORD`            | Android  | Production key password                |
| `IOS_DISTRIBUTION_CERT_BASE64`    | iOS      | App Store distribution certificate     |
| `IOS_CERT_PASSWORD`               | iOS      | Production certificate password        |
| `IOS_PROVISIONING_PROFILE_BASE64` | iOS      | App Store provisioning profile         |
| `APP_STORE_API_KEY_ID`            | iOS      | App Store Connect API key (production) |
| `APP_STORE_API_ISSUER`            | iOS      | App Store Connect issuer               |
| `WINDOWS_SIGNING_CERT_BASE64`     | Windows  | Microsoft Store signing certificate    |
| `WINDOWS_CERT_PASSWORD`           | Windows  | Signing certificate password           |
| `VERCEL_TOKEN`                    | Web      | Vercel production deployment token     |
| `SUPABASE_URL`                    | Backend  | Production Supabase URL                |
| `SUPABASE_ANON_KEY`               | Backend  | Production Supabase anon key           |
| `SUPABASE_SERVICE_ROLE_KEY`       | Backend  | Production service role key            |

### Secret Encoding Convention

For binary secrets (keystores, certificates, provisioning profiles):

```bash
# Encode a binary file to Base64 for storage as a GitHub secret
base64 -i my-keystore.jks | pbcopy         # macOS
base64 -w 0 my-keystore.jks | xclip        # Linux
certutil -encode my-keystore.jks encoded.b64  # Windows (then copy content)
```

### Secret Access Pattern in Workflows

```yaml
jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    environment: staging # ← This unlocks staging secrets
    steps:
      - name: Deploy
        run: deploy --url "${{ secrets.SUPABASE_URL }}"
        # secrets.SUPABASE_URL resolves to the staging value

  deploy-production:
    runs-on: ubuntu-latest
    environment: production # ← This unlocks production secrets + requires approval
    steps:
      - name: Deploy
        run: deploy --url "${{ secrets.SUPABASE_URL }}"
        # secrets.SUPABASE_URL resolves to the production value
```

## Deployment Approval Gates

### How Approval Works

1. A workflow job references `environment: production`
2. GitHub pauses the job and notifies required reviewers
3. Reviewers see the pending deployment in the repository's **Actions** tab
4. After 2 reviewers approve, a 5-minute wait timer begins
5. The job starts after the timer expires

### Approval Flow Diagram

```
Tag push (v1.0.0)
  │
  ├─→ Build & Test (no environment — runs immediately)
  │     ├─ Compile
  │     ├─ Unit tests
  │     └─ Upload artifacts
  │
  └─→ Deploy (environment: production)
        │
        ├─ ⏸ PAUSED — waiting for approval
        │     └─ Notifies: @jrmoulckers/release-managers
        │
        ├─ ✅ 2 reviewers approve
        │
        ├─ ⏳ 5-minute wait timer
        │
        └─ 🚀 Deploy executes
```

### Configuring Reviewers

In **Settings → Environments → production → Required reviewers**, add:

- Individual users who are release managers
- Or a team (e.g., `@jrmoulckers/release-managers`)

### Emergency Override

If a critical hotfix is needed and reviewers are unavailable:

1. A repository admin can temporarily disable the environment protection
2. Deploy the hotfix
3. **Immediately re-enable** the protection rule
4. Document the override in the release notes

> ⚠️ Emergency overrides must be logged and reviewed in the next team sync.

## Workflow Templates

### Environment-Aware Deploy Job

```yaml
# Template for any deployment job that respects environment gates
deploy:
  name: Deploy to ${{ inputs.environment }}
  runs-on: ubuntu-latest
  needs: [build, test] # Always run after build + test
  environment:
    name: ${{ inputs.environment }}
    url: ${{ steps.deploy.outputs.url }}
  steps:
    - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
    - name: Download build artifacts
      uses: actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131 # v7.0.0
      with:
        name: build-output
    - name: Deploy
      id: deploy
      run: |
        # Environment-specific secrets resolve automatically
        echo "Deploying to ${{ inputs.environment }}"
```

### Dynamic Environment Selection

```yaml
# Choose environment based on trigger context
jobs:
  determine-env:
    runs-on: ubuntu-latest
    outputs:
      environment: ${{ steps.env.outputs.name }}
    steps:
      - id: env
        run: |
          if [[ "${{ github.ref }}" == refs/tags/v*-rc* ]]; then
            echo "name=staging" >> "$GITHUB_OUTPUT"
          elif [[ "${{ github.ref }}" == refs/tags/v* ]]; then
            echo "name=production" >> "$GITHUB_OUTPUT"
          else
            echo "name=development" >> "$GITHUB_OUTPUT"
          fi

  deploy:
    needs: determine-env
    environment: ${{ needs.determine-env.outputs.environment }}
    # ...
```

### Matrix Deploy Across Environments

```yaml
# Deploy to staging first, then production (with gate)
jobs:
  deploy:
    strategy:
      max-parallel: 1 # Sequential deployment
      matrix:
        environment: [staging, production]
    environment: ${{ matrix.environment }}
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploying to ${{ matrix.environment }}"
```

## Secret Rotation

### Rotation Schedule

| Secret Type          | Rotation Frequency | Responsible   |
| -------------------- | ------------------ | ------------- |
| Signing certificates | Annually           | Platform lead |
| API keys             | Quarterly          | Backend lead  |
| Deployment tokens    | Quarterly          | DevOps lead   |
| Service role keys    | Quarterly          | Backend lead  |

### Rotation Procedure

1. Generate new credentials using the appropriate platform tool
2. Test the new credentials in the `staging` environment first
3. Update the `production` environment secret
4. Verify a release build succeeds with the new credentials
5. Revoke the old credentials
6. Update the rotation log in the team wiki

### Rotation Checklist

```markdown
- [ ] New credential generated
- [ ] Staging environment updated
- [ ] Staging deployment tested
- [ ] Production environment updated
- [ ] Production deployment tested
- [ ] Old credential revoked
- [ ] Rotation logged with date and responsible person
```

## Troubleshooting

### "Secret not found" in workflow logs

- Verify the job has `environment:` set to the correct environment
- Check that the secret name matches exactly (case-sensitive)
- Ensure the branch is allowed by the environment's branch restriction

### "Waiting for approval" stuck

- Check **Settings → Environments → production → Required reviewers**
- Ensure at least 2 reviewers from the list are available
- Repository admins can approve if designated reviewers are unavailable

### "Environment not found" error

- Environments must be created in **Settings → Environments** before use
- Environment names are case-sensitive in workflow YAML

### Secrets available in forks?

- **No.** Environment secrets are never exposed to fork PRs
- Repository secrets with `pull_request` trigger also exclude forks by default
- This is a GitHub security feature and cannot be overridden

---

For related documentation, see:

- [Release Process](release-process.md)
- [Deployment Runbook](deployment-runbook.md)
- [Branch Protection Setup](branch-protection-setup.md)
