# Workflow reuse assessment

Whether finance's 31 hand-authored workflows should call the reusable workflows in
[`jrmoulckers/.github`](https://github.com/jrmoulckers/.github/tree/main/.github/workflows).

Produced under #4029 (adopting `jrmoulckers/engineering`). Assessment only — no workflow is
migrated here. Migrating a **required** check is a branch-protection-affecting change and does
not belong in an adoption PR.

## Action pinning: already compliant

`GH-ACT-003` requires every action ref to be a full 40-character commit SHA.

| Measure                                                 | Count |
| ------------------------------------------------------- | ----- |
| `uses:` refs across all 31 workflows                    | 241   |
| Refs pinned to a 40-char SHA                            | 241   |
| **Unpinned refs**                                       | **0** |
| Local `./.github/workflows/...` refs (not SHA-pinnable) | 8     |
| Distinct third-party actions                            | 30    |

No remediation needed. Re-verify with:

```powershell
$all = Select-String -Path .github\workflows\*.yml -Pattern '^\s*-?\s*uses:\s*(\S+)' -AllMatches |
  ForEach-Object { $_.Matches[0].Groups[1].Value }
$all | Where-Object { $_ -notmatch '@[0-9a-f]{40}$' -and $_ -notmatch '^\./' }
```

## Overlap with the backbone reusables

The backbone publishes 8 reusables. Seven finance workflows overlap one.

| finance workflow                  | Lines | Backbone counterpart                                       | Verdict                            |
| --------------------------------- | ----- | ---------------------------------------------------------- | ---------------------------------- |
| `ci-lint.yml`                     | 215   | `reusable-ci-lint.yml`                                     | **Superset — do not migrate**      |
| `ci-web.yml`                      | 286   | `reusable-ci-web.yml`                                      | **Superset — do not migrate**      |
| `ci-security.yml`                 | 550   | `reusable-security-ci.yml`                                 | **Superset — do not migrate**      |
| `deploy-preview.yml`              | 394   | `reusable-deploy-preview.yml` + `reusable-perf-budget.yml` | **Divergent — partial candidate**  |
| `deploy-pages.yml`                | 86    | `reusable-deploy-pages.yml`                                | **Closest candidate**              |
| `reusable-detect-changes.yml`     | 64    | `reusable-change-detection.yml`                            | **Divergent — already reconciled** |
| `reusable-release-smoke-test.yml` | 307   | `reusable-smoke-test.yml`                                  | **Divergent — do not migrate**     |

### Superset — migration would lose enforcement

**`ci-lint.yml`** runs four jobs against the reusable's one. Beyond lint + format + semantic PR
title it adds: the skip-with-success `changes` detector that keeps a required check reporting on
every PR; `.eslintcache` restore keys; financial-terminology glossary validation
(`scripts/i18n/validate-glossary.js`); and an `observability-guardrails` job whose sensitive-data
grep **fails the build** — the executable form of `ENG-OBS-005` (Redacted observable evidence).
The reusable has no equivalent for any of these. Swapping it in would delete a blocking privacy
check.

**`ci-web.yml`** runs 7 jobs. `reusable-ci-web.yml` covers typecheck/test/build/artifact but not
the four Playwright jobs (PR smoke, PR report, main desktop matrix, main report) or the change
detector.

**`ci-security.yml`** runs 10 jobs — CodeQL for Java/Kotlin _and_ JavaScript, dependency review,
secret scanning, gitleaks, npm audit, Gradle OWASP dependency-check, license check, summary, and
an always-on `gatekeeper` backstop. `reusable-security-ci.yml` offers audit + secret scan +
dependency review only, and has no Kotlin/Gradle path at all — finance is a KMP repo.

### Divergent

**`reusable-detect-changes.yml`** — already reconciled. Its header records the canonical
comparison (`jrmoulckers/.github@97ff60ec21321563fa0fc7ba80015261e7dcd6fa`) and states why
finance keeps a `dorny/paths-filter` adapter: the backbone's detector takes literal JSON path
prefixes and exact SHAs, while every finance required-check caller passes glob-based YAML
filters. Migration would change every caller's filter contract and is not parity-safe. **This is
not a vendored copy** — it is a documented, deliberately different adapter. No action.

**`reusable-release-smoke-test.yml`** — a 6-job per-platform release gate (Android, iOS, web,
Windows, validate, summary). The backbone's `reusable-smoke-test.yml` is a single-artifact
build-and-probe with an HTTP retry loop. Different shape entirely; not a substitute.

**`deploy-preview.yml`** — 5 jobs. The `lighthouse` job overlaps `reusable-perf-budget.yml`
(which takes `bundle-budget-kb`, `lhci-min-performance`, `lhci-min-accessibility`), and the
build/upload half overlaps `reusable-deploy-preview.yml`. The PR-comment and cleanup jobs have
no counterpart. A partial migration is plausible but touches a PR-visible surface.

### Best candidate

**`deploy-pages.yml`** (86 lines, 2 jobs: build, deploy) against `reusable-deploy-pages.yml`
(167 lines), whose inputs — `node-version`, `package-manager`, `working-directory`,
`build-command`, `output-dir`, `page-url` — cover what finance's version does. It is the
smallest workflow, is **not** a required check, and its failure mode is contained. This is where
a reuse migration should start.

## The caller-permissions trap

Any migration to a backbone reusable inherits a failure mode that is invisible to linting. A
caller's `permissions:` block **replaces** the default rather than adding to it, and a called
workflow can never hold more than its caller grants. A caller that lists fewer scopes than the
callee declares dies as `startup_failure` in about a second, with no failing step and no readable
log. `actionlint` does not model this and passes on both sides, so a green linter is not evidence.

Scopes each backbone callee declares, at
`f1457271427fcde18a62b07c53a1ea75e14cd644`:

| Callee                      | Caller must grant                     |
| --------------------------- | ------------------------------------- |
| `reusable-ci-lint`          | contents, packages, pull-requests     |
| `reusable-ci-web`           | contents, packages                    |
| `reusable-deploy-pages`     | contents, packages, `id-token: write` |
| `reusable-deploy-preview`   | contents, packages                    |
| `reusable-perf-budget`      | contents, packages — installs nothing |
| `reusable-smoke-test`       | contents, packages                    |
| `reusable-security-ci`      | contents                              |
| `reusable-change-detection` | contents                              |

The grant tracks what the callee **declares**, not whether it installs anything —
`reusable-perf-budget` consumes a build artifact and runs no install, so "no install, therefore no
registry scope" is sound reasoning that produces a dead workflow.

**Measured for finance, because the usual mitigation does not apply here.** The advice that "a
caller with no `permissions:` block is immune, because it inherits the repo default" holds only
when the repository default is permissive. Finance's is restricted:

```console
$ gh api repos/jrmoulckers/finance/actions/permissions/workflow
{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}
```

What that actually grants was measured rather than assumed — a temporary probe workflow declaring
no `permissions:` block, reading the `GITHUB_TOKEN Permissions` group Actions prints at job setup:

```text
##[group]GITHUB_TOKEN Permissions
Contents: read
Metadata: read
Packages: read
```

So the restricted default is exactly `{contents, metadata, packages}: read`. Two consequences:

1. **`packages: read` is granted by default.** The scope this trap is usually described in terms of
   is the one least at risk here. Omitting the block covers six of the eight callees above.
2. **It fails for the other two, and they are the ones needing a non-`packages` scope** —
   `reusable-ci-lint` (`pull-requests: read`) and `reusable-deploy-pages` (`id-token: write`).
   `id-token: write` is a _write_ scope, which a restricted default never grants under any
   circumstance.

The general rule, which is shorter than the table: under a restricted default, a caller may omit
`permissions:` only if the callee needs nothing outside `{contents, metadata, packages}: read`.

Finance has no escape hatch regardless — **all 31 workflows already declare a `permissions:`
block**, so the "immune by omission" state does not exist anywhere in this repository and would
have to be created deliberately, file by file.

Note the ordering hazard this creates: the first recommended migration below is the single worst
case in the table.

## Recommendation

1. Migrate `deploy-pages.yml` first, alone, in its own PR. Lowest blast radius, not
   branch-protection gated. **Grant `contents: read`, `packages: read`, and `id-token: write`
   explicitly** — this callee needs the one scope the restricted default can never supply, so a
   caller written from the "packages" framing alone will fail with an unreadable
   `startup_failure`.
2. Then consider the `lighthouse` job of `deploy-preview.yml` → `reusable-perf-budget.yml`.
3. Leave `ci-lint`, `ci-web`, and `ci-security` alone until the backbone reusables grow the
   Kotlin/Gradle, Playwright, and skip-with-success capabilities they currently lack. Each is a
   required check protecting `main`.
4. Nothing here is vendored upstream logic, so no workflow needs deleting.

## Candidates to hoist up

Two mechanisms finance invented that are generic enough to belong in the backbone rather than
here:

- **The skip-with-success required-check pattern** (`ci-lint.yml` and
  `reusable-detect-changes.yml`) — a path-filtered required check never reports its status,
  leaving PRs permanently `BLOCKED`. Gating _inside_ the workflow instead of via
  `on.pull_request.paths` is the fix. Learned the hard way; applies to every repo with branch
  protection.
- **The sensitive-data-logging grep guardrail** (`ci-lint.yml`, `observability-guardrails`) — an
  executable check for `ENG-OBS-005`, which the practices layer currently states only as an
  obligation.
