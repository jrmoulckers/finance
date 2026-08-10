---
applyTo: '**'
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Change Delivery Workflow

Read-only research, audits, and planning do not require an issue when they make no repository
change. Before the first repository change, verify or create an issue; every repository change must
trace to that issue and land through a feature branch and PR.

## Default Workflow

1. Verify or create the GitHub issue.
2. Scan for an existing worktree for the issue; resume it if found.
3. Otherwise prefer an app-native isolated project session/worktree from the default branch. If that
   capability is unavailable, require a runtime-provided, explicitly approved location allowed by
   root/scoped authority.
4. Implement scoped changes on a feature branch.
5. Commit as `type(scope): description (#N)`.
6. Run the repo's documented format, lint, type-check, test, and build commands for the affected surface.
7. Fetch and rebase onto the default branch.
8. Push the feature branch and create a PR with `Closes #N`.
9. Verify the PR exists with `gh pr view`.
10. Monitor CI and mergeability until checks are green and the PR is `MERGEABLE`.
11. Self-merge only PRs you authored when the quality gate passes and local `AGENTS.md` permits it.
12. Remove the worktree after merge.

Stopping at a local commit is incomplete. A change is done only when the PR is merged, or when a
green, mergeable PR clearly documents a `## Needs Human Action` blocker. Local `AGENTS.md` decides
self-merge and operational authority; this instruction never expands either.

## Definition of Done

| Gate | Verification | Pass criteria |
| --- | --- | --- |
| Clean tree | `git status` | No uncommitted changes. |
| Pushed | `git log origin/<branch>..HEAD` | Empty. |
| PR exists | `gh pr view <branch> --json number` | Returns a PR number. |
| CI green | `gh pr checks <number>` | No failing or pending required checks. |
| Mergeable | `gh pr view <number> --json mergeable,mergeStateStatus` | `MERGEABLE`, not dirty/behind. |
| Issue linked | PR body | `Closes #N` for each resolved issue. |
| Landed | `gh pr view <number> --json state` | `MERGED`, or a documented human-gated blocker. |

## Worktrees

Prefer app-native isolated project sessions/worktrees rather than extra clones. Never invent or
hard-code a sibling worktree path. If app-native isolation is unavailable, the runtime must provide
an explicitly approved worktree location and root/scoped authority must permit it; otherwise stop.

```bash
git worktree list
git worktree add <approved-worktree-path> -b <type>/<short-description>-<issue> origin/<default-branch>
git worktree remove <approved-owned-worktree-path>
```

Record the exact branch, path, and creating session before mutation. Remove only worktrees created
and owned by the current session; never recursively delete a worktree path.

Branch types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`.

## Issue Lifecycle

`Created → PR opened with Closes #N → PR merged → issue auto-closed`.

Rules:

- Do not close issues manually; let linked PRs close them on merge.
- Use `Closes #N` for completed work and `Refs #N` for related context.
- Put each closing reference on its own line in the PR body.

## Validation

Run the product's own commands. Prefer documented scripts over ad hoc tool calls.

Typical coverage:

- Formatter / format check.
- Linter.
- Type-check or static analysis.
- Unit/integration tests for changed behavior.
- Build/package checks for affected apps or packages.

If any check fails, fix it, rerun the relevant checks, create a new scoped commit, and push again.
Amend only when the user explicitly requests it and applicable authority permits it.

## Calling reusable workflows

Studio product repos call the backbone's reusable workflows at a reviewed immutable commit SHA:
`uses: jrmoulckers/.github/.github/workflows/reusable-*.yml@<reviewed-commit-sha>`. The reference
must be a full 40-character SHA; branches and tags are rejected. Configure Dependabot, Renovate, or
equivalent automation to propose SHA update PRs, then review the exact upstream diff and release
notes. Never resolve a mutable reference during a run.

**A caller `permissions:` block replaces the defaults — it does not add to them.** Every scope you
omit is set to `none`, and a called workflow can never receive more than its caller holds. So a
least-privilege `permissions: { contents: read }` in the caller silently strips the scopes the
reusable workflow declares for itself. The symptom is a bare `startup_failure` with **no readable
log**, which is easy to misdiagnose as a broken `uses:` reference.

Grant every scope the callee declares:

| Reusable workflow | Scopes the caller must grant |
| --- | --- |
| `reusable-ci-lint` | `contents: read`, **`packages: read`**, **and `pull-requests: read`** (Semantic PR Title job) |
| `reusable-ci-web` | `contents: read`, `packages: read` |
| `reusable-perf-budget` | `contents: read`, `packages: read` |
| `reusable-smoke-test` | `contents: read`, `packages: read` |
| `reusable-native-smoke-test` | `contents: read`, `packages: read` (the web job; the other platform jobs need only `contents: read`) |
| `reusable-deploy-preview` | `contents: read`, `packages: read` |
| `reusable-change-detection` | `contents: read` |
| `reusable-security-ci` | `contents: read` |
| `reusable-deploy-pages` | `contents: read`, `packages: read`, `pages: write`, and `id-token: write` |

```yaml
permissions:
  contents: read
  packages: read          # required by every Node-installing reusable workflow
  pull-requests: read      # required by reusable-ci-lint

jobs:
  lint:
    uses: jrmoulckers/.github/.github/workflows/reusable-ci-lint.yml@<reviewed-commit-sha>
    with:
      package-manager: pnpm
```

Rules:

- Before adding a caller-level `permissions:` block, open the callee and copy its declared scopes.
- Omitting `permissions:` entirely inherits the repo default — safe, but less explicit.
- If a scope truly cannot be granted, disable the job that needs it instead
  (e.g. `semantic-pr-title: false` for `reusable-ci-lint`).
- Debug a `startup_failure` with no log by checking caller permissions first.
- Caller workflows own CI concurrency. Put the concurrency group on the caller workflow so matrix or
  multi-package reusable jobs do not cancel sibling calls. Canonical Pages deployment is the
  exception: it serializes repository deployments with `cancel-in-progress: false`.

### Taking only part of `reusable-ci-lint`

`reusable-ci-lint` carries three independent checks — lint, format-check, and Conventional-Commits
PR title — and each is opt-out, so never inline a local copy of one of them:

- No ESLint/Prettier in the repo? Pass `lint-command: ''` and `format-check-command: ''`. The lint
  job then skips entirely (no checkout, no install) and only the PR-title check runs.
- Have a linter but no formatter (or vice versa)? Empty just the one you lack.
- Can't grant `pull-requests: read`? Pass `semantic-pr-title: false`.

```yaml
permissions:
  contents: read
  pull-requests: read

jobs:
  pr-title:
    uses: jrmoulckers/.github/.github/workflows/reusable-ci-lint.yml@<reviewed-commit-sha>
    with:
      lint-command: ''
      format-check-command: ''
```

Passing an empty string is the supported opt-out. Leaving a command at its default in a repo that
has no such script fails the job; duplicating backbone logic locally makes the product repo drift
from canon.

### Smoke testing a native-first release

`reusable-smoke-test` is web-shaped: one job, a Node toolchain, and an optional HTTPS probe against
a deployed site. Use `reusable-native-smoke-test` instead when a release ships native artifacts and
a green web check would leave Android, iOS, or Windows unvalidated.

It runs `validate`, then one job per selected platform, then a `summary` that reduces the verdicts
to a single `result` output a release workflow can gate on. Unselected platforms are reported as
skipped and count as a pass; a selected platform that fails, fails the run.

```yaml
permissions:
  contents: read
  packages: read          # the web job installs Node dependencies

jobs:
  smoke:
    uses: jrmoulckers/.github/.github/workflows/reusable-native-smoke-test.yml@<reviewed-commit-sha>
    with:
      version: ${{ github.ref_name }}
      platforms: android,ios,web
      ios-scheme: ExampleApp
      package-manager: pnpm
      build-command: pnpm --filter web build
```

Narrow `platforms` on non-release runs: the iOS and Windows jobs use macOS and Windows runners,
which bill at a higher rate than Linux. Remote build caches are not accepted — builds run cold and
Gradle's cache is read-only, so a release is validated from source rather than from a cache.

### Build once and reuse same-run artifacts

`reusable-ci-web` optionally uploads a validated directory when `artifact-name` is set. Preview,
performance, and smoke jobs accept that exact same-run artifact name. The caller must declare
`needs` so the producer completes first; consumers do not accept a repository, run ID, or token, so
they cannot fetch cross-run or cross-repository artifacts.

```yaml
jobs:
  web:
    uses: jrmoulckers/.github/.github/workflows/reusable-ci-web.yml@<reviewed-commit-sha>
    with:
      artifact-name: web-build
      artifact-path: dist

  performance:
    needs: web
    uses: jrmoulckers/.github/.github/workflows/reusable-perf-budget.yml@<reviewed-commit-sha>
    with:
      artifact-name: ${{ needs.web.outputs.artifact-name }}
      output-dir: dist
```

At the caller workflow level, use a ref-scoped group for superseded CI runs:

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Never pass an untrusted artifact into a job with secrets or write authority. `reusable-deploy-pages`
does not accept an arbitrary artifact: its unprivileged build job creates the fixed Pages artifact,
and its environment-gated deploy job only calls GitHub's deploy action with `pages: write` and
`id-token: write`.

### Security and preview boundaries

- Reusable commands are trusted repository configuration. Pass literal workflow values, never event
  titles, branch names, issue text, or other untrusted data.
- Never use `secrets: inherit`. `NODE_AUTH_TOKEN` is the only secret any canonical reusable workflow
  accepts, it is optional, and it must be passed explicitly when it is passed at all. When it is
  omitted the workflow falls back to the job's `GITHUB_TOKEN`.
- Preview canon is artifact-only. The removed `provider`, `preview-command`, `DEPLOY_TOKEN`, and
  `preview-url` contracts must not be recreated. Provider deployments require a separate reviewed
  job, a protected environment, explicit secrets, and no PR-controlled arbitrary shell.
- Lighthouse reports remain private GitHub artifacts by default. Enable
  `lighthouse-public-upload` only for an intentionally public, unauthenticated URL after accepting
  that report data will leave GitHub's private artifact boundary.

### Installing from a private registry

`reusable-ci-lint`, `reusable-ci-web`, `reusable-deploy-pages`, `reusable-deploy-preview`,
`reusable-perf-budget`, `reusable-smoke-test`, and `reusable-native-smoke-test` accept optional
`registry-url` and
`registry-scope` inputs plus an optional `NODE_AUTH_TOKEN` secret. Leave all three unset and the
run is unchanged: `actions/setup-node` ignores an empty `registry-url` entirely and writes no
`.npmrc`, and no token is placed in the install step's environment.

For GitHub Packages this is zero-config — pass no secret at all:

```yaml
permissions:
  contents: read
  packages: read

jobs:
  web:
    uses: jrmoulckers/.github/.github/workflows/reusable-ci-web.yml@<reviewed-commit-sha>
    with:
      package-manager: pnpm
      registry-url: https://npm.pkg.github.com
      registry-scope: '@jrmoulckers'
```

`NODE_AUTH_TOKEN` resolves as `secrets.NODE_AUTH_TOKEN || github.token`, so the job's
`GITHUB_TOKEN` is used unless the caller passes its own. Grant the consuming repository read access
to each package under the package's **Manage Actions access** settings; GitHub recommends this over
storing a PAT. Pass an explicit secret only for a registry `GITHUB_TOKEN` cannot reach:

```yaml
    secrets:
      NODE_AUTH_TOKEN: ${{ secrets.MY_REGISTRY_PAT }}
```

Rules and interactions:

- `packages: read` is required for `GITHUB_TOKEN` to read a GitHub Packages package at all, and a
  caller `permissions:` block must grant it or the run fails at startup.
- `registry-scope` requires `registry-url`. Setting `registry-url` without a scope replaces the
  **default** registry for every package and emits a warning.
- `actions/setup-node` writes its `.npmrc` to `$RUNNER_TEMP/.npmrc` and exports
  `NPM_CONFIG_USERCONFIG`, so it is **user**-level config. A repo's own committed `.npmrc` is
  **project**-level and outranks it on every key it sets, for both npm and pnpm. A project `.npmrc`
  that points the same scope at a different registry wins and the install still fails; either delete
  that line or keep it byte-identical. A project `.npmrc` that only sets unrelated keys is fine.
- pnpm reads `NPM_CONFIG_USERCONFIG` and expands `${NODE_AUTH_TOKEN}` the same way npm does, so no
  extra pnpm-specific step is needed. `setup-node` always exports `NODE_AUTH_TOKEN` (a placeholder
  when the secret is absent), which keeps pnpm's env-expansion from erroring.
- The token reaches the install step only when `registry-url` is set. A run that does not configure
  a private registry gets an empty `NODE_AUTH_TOKEN`, so a `GITHUB_TOKEN` is never exposed to
  dependency lifecycle scripts on the default path. A consequence worth knowing: passing
  `NODE_AUTH_TOKEN` *without* `registry-url` has no effect, because there is no `.npmrc` to consume
  it.
- `reusable-security-ci` needs none of this. `npm audit` and `pnpm audit` send the bulk advisory
  request to the **default** registry, never to a scoped one, so a private scoped package in the
  lockfile does not trigger a `401`. Pointing the *default* registry at GitHub Packages does break
  audit, but with `ENDPOINT_NOT_EXISTS` (no audit endpoint) rather than an auth error — a token
  would not fix it. Note that audit does transmit private package names and versions to the default
  registry.

### Never vendor a backbone workflow or health file

`workflows` and `health` are **native** kinds: they reach product repos through GitHub itself, not
through the sync engine, which resolves and reports them but never writes a file for them. So a
product repo must contain **no copy of its own**:

- **No `.github/workflows/reusable-*.yml`.** Call the backbone's with
  `uses: jrmoulckers/.github/.github/workflows/reusable-*.yml@<reviewed-commit-sha>`, never
  `uses: ./.github/workflows/reusable-*.yml`. A vendored copy is a silent fork: upstream fixes never
  reach it and nothing flags the divergence.
- **No `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `PULL_REQUEST_TEMPLATE.md`,
  `ISSUE_TEMPLATE/` or `DISCUSSION_TEMPLATE/`** unless you are deliberately overriding the studio
  version for that repo. GitHub prefers a repo's own health file over the one inherited from
  `jrmoulckers/.github`, so a verbatim copy overrides the inherited file and freezes it at the day
  it was copied.

  If you *are* overriding deliberately — because the repo needs product-specific security content
  that cannot live in canon — that is allowed, but you own the consequence: the file is a fork with
  no update path, and canon changes will never reach it. Re-read canon when it moves.
  **Do not restate canon's policy in your own words in order to differ from it in one place**; check
  first whether canon already offers a variant you can select. Its security policy defines two
  support postures precisely so that a continuously-deployed product can *select* the right one
  rather than file a deviation against the other
  ([ADR-0010](https://github.com/jrmoulckers/.github/blob/main/docs/architecture/0010-selectable-support-postures.md)).

In both cases a local copy is **worse than having nothing**, and the sync engine cannot rescue you
— it never writes native kinds, so it can neither update the copy nor report it as drift. If you
find one in a member repo, delete it; that is the whole fix.

Opting in to `health` or `workflows` in `studio.config.json` means *"this member relies on the
backbone's"* — it is a declaration, not an install.

## Merge Conflict Protocol

Treat conflicts with the same urgency as red CI.

Detect every polling cycle:

```bash
gh pr view <number> --json mergeable,mergeStateStatus,headRefName
```

| State | Action |
| --- | --- |
| `MERGEABLE` + `CLEAN`/`UNSTABLE` | Continue monitoring CI. |
| `MERGEABLE` + `BEHIND` | Rebase on the default branch and re-push. |
| `CONFLICTING` or `DIRTY` | Run the auto-resolve cycle. |
| `UNKNOWN` | Wait briefly and re-poll. |

Auto-resolve only mechanical conflicts you understand: whitespace, import order, regenerated files, changelog ordering, or lockfiles recreated by the repo's package manager. Escalate semantic conflicts such as same-function edits, schema changes, security-sensitive logic, or incompatible refactors.

Use `git push --force-with-lease` only after a rebase on your own PR branch. Never use plain `git push --force`.

## Fleet Coordination

For parallel sprint work:

1. Query issues and PRs.
2. Resolve applicable roles from root/scoped `AGENTS.md`, consumer `.github/instructions/`, and
   declared local routing. A discovered `.github/agents/` file alone does not authorize dispatch;
   exclude disabled, handoff-only, read-only, and out-of-scope roles.
3. Track assignments in SQL todos.
4. Batch small related issues only when they touch the same files and keep the PR under reviewable size.
5. Publish a merge order for dependent PRs.
6. Re-dispatch failed or incomplete agents until every PR is green and mergeable.

## Commit Messages

```text
type(scope): description (#N)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

## PR Body

```markdown
## Summary

Brief description.

## Changes

- Bullet list.

## Issues

Closes #N

## Testing

- [ ] Repo validation command(s) run
```
