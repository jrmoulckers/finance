---
applyTo: '.github/workflows/**'
---

# Instructions for GitHub Actions Workflows

You are working in `.github/workflows/`, owned by `@devops-engineer` for CI/CD, release automation, and reusable workflow maintenance.

## Workflow Authoring Rules

- Pin every third-party action by full commit SHA and keep a version comment beside it (for example, `actions/checkout@<sha> # v6.0.3`); never use floating tags like `@v4`.
- Use least-privilege `permissions:` at the workflow and job level. Start with `contents: read` and add scopes only when a job needs them.
- Prefer `concurrency`, timeouts, and caches so checks are fast and deterministic across the monorepo. Use path scoping to avoid wasted work, but **only via an in-workflow `changes` detector** for required checks — never via trigger-level `on.pull_request.paths` (see "Required checks must not be path-skipped at the trigger level" below).
- Extract repeated setup/build/smoke-test logic into `workflow_call` reusable workflows named `reusable-*.yml`.
- Keep required checks blocking and reliable. Informational checks may use `continue-on-error: true`, but must report their status clearly in `$GITHUB_STEP_SUMMARY`.
- Never echo secrets, tokens, or full environment dumps. Read credentials only from GitHub `secrets`/`vars`, mask derived sensitive values, and avoid writing them to summaries or artifacts.

## Finance CI Conventions

- CI workflows should target `main` and use path filters aligned to repo ownership: `apps/**`, `packages/**`, `services/**`, `.github/workflows/**`, `build-logic/**`, and `tools/**`.
- Cache keys must include the relevant lockfiles or Gradle/version-catalog inputs (`package-lock.json`, `gradle/libs.versions.toml`, `build-logic/**`) so stale dependencies do not leak across jobs.
- Required checks should validate format, lint, type/build, tests, or security gates; release, deploy, and smoke workflows must preserve explicit human approval gates before production-impacting actions.
- Keep workflow names stable because branch protection and PR status checks depend on them.

## Required checks must not be path-skipped at the trigger level

A status check is **required** when its context name is listed in `main`'s branch protection (today: `ESLint & Prettier`, `Secret Detection`, `CodeQL Analysis (javascript-typescript)`, `CodeQL Analysis (java-kotlin)`, `submit-gradle`, `Build` (web), and `Build & Test` (shared by ci-ios/ci-android/ci-windows)).

**Never add `paths:` or `paths-ignore:` to `on.pull_request` (or `on.push`) for a workflow that emits a required check.** When a PR doesn't match a trigger-level path filter, the workflow does not run at all, so its required context is **never reported** — GitHub then holds the PR in a permanently pending `BLOCKED` state that can only be cleared with `--admin`.

Use the **skip-with-success** pattern instead — scope the work _inside_ the workflow so the required context always reports:

1. A cheap `changes` job that always runs on `pull_request` and uses `dorny/paths-filter` (pinned by SHA) to set a `relevant` output. Guard the filter step with `if: github.event_name == 'pull_request'` so non-PR events fall through.
2. The real job(s) declare `needs: changes` and
   `if: ${{ github.event_name != 'pull_request' || needs.changes.outputs.relevant == 'true' }}`.

When the paths are untouched the real job is **skipped**, which branch protection counts as a **pass** for the required context — verified live in this repo (a required check whose only run is `skipped` reaches `CLEAN`/`MERGEABLE` with no `--admin`). On `push` the short-circuit makes the job always run.

Each workflow's own file (e.g. `.github/workflows/ci-web.yml`) must be in its `relevant` filter so that editing the CI definition re-runs that platform's real build on the PR (self-validation).

See `docs/ops/ci-workflow.md` for the full rationale and the canonical detector snippet.
