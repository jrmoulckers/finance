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
grep **fails the build** — the executable form of `ENG-OBS-005` (redacted observable evidence).
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

## Recommendation

1. Migrate `deploy-pages.yml` first, alone, in its own PR. Lowest blast radius, not
   branch-protection gated.
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
