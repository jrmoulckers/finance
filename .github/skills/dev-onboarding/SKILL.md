---
name: dev-onboarding
description: >
  Developer onboarding and environment setup guidance. Use for topics related to
  setup, install, onboarding, getting started, prerequisites, local tooling,
  environment checks, repository workflow, or new developer support.
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Developer Onboarding Skill

**Trigger:** first-time setup, local environment failures, prerequisite checks, contributor workflow questions.
**Inputs:** repository README/AGENTS, package manifests, setup scripts, failing command output, platform in scope.
**Related:** `mcp-agent-tooling` (agent tools/MCP), `sprint-planning` (work selection),
`issue-management` (filing onboarding gaps).

## Out of scope

- Product architecture or platform build internals → use the relevant domain skill.
- MCP server permissions and agent tool wiring → use `mcp-agent-tooling`.
- Sprint dispatch, CI monitoring, rebases, and merges → use the `team` prompt and workflow
  instructions.
- Issue triage and template quality → use `issue-management`.

## Method

1. **Read local guidance** — start with `AGENTS.md`, README, contributing docs, and package manifests.
2. **Confirm prerequisites** — check required runtime versions, package managers, editor extensions, and platform SDKs only for the platforms in scope.
3. **Install with repo tools** — use the repository's documented install/setup commands; do not invent a new bootstrap path.
4. **Run smoke checks** — execute the smallest documented lint/type/test/build gate that proves the environment works.
5. **Verify workflow** — confirm issue-first branching, conventional commits, PR expectations, and local quality gates.
6. **Capture gaps** — file scoped onboarding issues when docs, scripts, or diagnostics are wrong.

## Setup checklist

| Area | Check |
| --- | --- |
| Versions | Required runtimes and package managers match repo docs |
| Dependencies | Install command completes without secrets or global mutations |
| Editor | Recommended extensions/settings are documented, not mandatory unless repo says so |
| Environment | `.env.example` placeholders exist; real secrets stay git-ignored |
| Quality gates | Repo lint/type/test/build commands are discoverable and runnable |
| Workflow | Branch, issue, commit, push, PR, and CI expectations are clear |

## Common fixes

- Re-run the documented install command after dependency or hook failures.
- Use the repo's package manager; do not mix lockfile ecosystems.
- Prefer the repo's scripts over raw tool invocations when validating setup.
- If a platform SDK is optional, skip it unless the task targets that platform.
- When CI differs from local results, compare versions, env vars, and generated files before changing code.

## Safety

Never read or create real secret files, install global tools without explicit repo guidance, or bypass quality gates. Preserve issue-first and conventional-commit discipline.

## Output

A working onboarding path with validated commands, any environment blockers, and filed issues for missing or stale setup documentation.