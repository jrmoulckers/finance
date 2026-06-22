---
applyTo: '.github/workflows/**'
---

# Instructions for GitHub Actions Workflows

You are working in `.github/workflows/`, owned by `@devops-engineer` for CI/CD, release automation, and reusable workflow maintenance.

## Workflow Authoring Rules

- Pin every third-party action by full commit SHA and keep a version comment beside it (for example, `actions/checkout@<sha> # v6.0.3`); never use floating tags like `@v4`.
- Use least-privilege `permissions:` at the workflow and job level. Start with `contents: read` and add scopes only when a job needs them.
- Prefer path filters, `concurrency`, timeouts, and caches so checks are fast and deterministic across the monorepo.
- Extract repeated setup/build/smoke-test logic into `workflow_call` reusable workflows named `reusable-*.yml`.
- Keep required checks blocking and reliable. Informational checks may use `continue-on-error: true`, but must report their status clearly in `$GITHUB_STEP_SUMMARY`.
- Never echo secrets, tokens, or full environment dumps. Read credentials only from GitHub `secrets`/`vars`, mask derived sensitive values, and avoid writing them to summaries or artifacts.

## Finance CI Conventions

- CI workflows should target `main` and use path filters aligned to repo ownership: `apps/**`, `packages/**`, `services/**`, `.github/workflows/**`, `build-logic/**`, and `tools/**`.
- Cache keys must include the relevant lockfiles or Gradle/version-catalog inputs (`package-lock.json`, `gradle/libs.versions.toml`, `build-logic/**`) so stale dependencies do not leak across jobs.
- Required checks should validate format, lint, type/build, tests, or security gates; release, deploy, and smoke workflows must preserve explicit human approval gates before production-impacting actions.
- Keep workflow names stable because branch protection and PR status checks depend on them.
