# Environment-Specific Workflow Templates

Reusable patterns for environment-aware GitHub Actions workflows in the Finance
monorepo. Copy and adapt these templates when creating new deployment workflows.

## Usage

These templates are **not** GitHub's official "workflow templates" feature
(which requires a `.github` repository). They are reference YAML files that
demonstrate the approved patterns for environment-gated deployments.

## Templates

| Template                   | Purpose                                    |
| -------------------------- | ------------------------------------------ |
| `deploy-with-approval.yml` | Standard deploy job with environment gates |
| `environment-matrix.yml`   | Progressive deploy across environments     |

## Key Rules

1. **Never hardcode secrets** — use `${{ secrets.* }}` from the environment
2. **Always pin actions** — use SHA, not version tags
3. **Production requires approval** — the `production` environment enforces this
4. **Build and test before deploy** — deploy jobs must `needs:` build/test jobs
5. **Artifacts flow forward** — upload in build, download in deploy

See [docs/ops/environments.md](../../docs/ops/environments.md) for full
environment and secrets documentation.
