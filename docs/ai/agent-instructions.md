# AI Agent Instructions — Finance Monorepo

This document describes the roles, skills, and workflow rules for all AI agents in the Finance monorepo. It is the canonical reference for agent capabilities, boundaries, and how to work with the AI system.

---

## Table of Contents

- [Agent Types](#agent-types)
- [Agent Skills](#agent-skills)
- [Workflow Rules](#workflow-rules)
- [Instruction Files](#instruction-files)
- [Fleet Mode & Parallelism](#fleet-mode--parallelism)
- [Human-Gated Operations](#human-gated-operations)
- [Updating Agents, Skills, and Instructions](#updating-agents-skills-and-instructions)

---

## Agent Types

The Finance monorepo uses specialized AI agents, each with a focused domain. Agents are defined in `.github/agents/` as `<role>.agent.md` files. Each agent has a clear mission, expertise areas, boundaries, and a list of allowed tools.

**Current agent types:**

- **accessibility-reviewer** — Reviews UI for WCAG 2.2 AA, platform accessibility, and inclusive design.
- **android-engineer** — Android (Jetpack Compose, KMP, PowerSync, Keystore, Wear OS).
- **architect** — System architecture, ADRs, cross-platform design, sync protocols.
- **backend-engineer** — Supabase/PostgreSQL, PowerSync, RLS, Edge Functions, migrations.
- **design-engineer** — Design tokens (DTCG), Style Dictionary, color/typography, component specs.
- **devops-engineer** — CI/CD (GitHub Actions, Turborepo, Fastlane, Changesets, security scanning).
- **docs-writer** — Technical documentation, onboarding, API docs, ADRs, AI workflow docs.
- **finance-domain** — Budgeting, financial modeling, domain logic, calculations, terminology.
- **ios-engineer** — iOS/SwiftUI, KMP integration, Keychain, VoiceOver, watchOS.
- **kmp-engineer** — Shared Kotlin Multiplatform (KMP) logic, SQLDelight, Ktor, Gradle config.
- **security-reviewer** — Security/privacy audits, compliance, authentication, encryption.
- **web-engineer** — PWA, React/TypeScript, KMP/JS, IndexedDB/SQLite-WASM, ARIA, Web Crypto.
- **windows-engineer** — Compose Desktop (JVM), Windows Hello, DPAPI, Narrator, MSIX.

Each agent file documents:

- Mission and expertise
- Key responsibilities
- Platform/code boundaries
- Human-gated operations (see below)

---

## Agent Skills

Agent skills are reusable knowledge bundles in `.github/skills/`, each with a `SKILL.md` file. Skills are activated automatically by agents when relevant keywords or domains are detected.

**Current skills:**

- **dev-onboarding** — Developer environment setup, onboarding, troubleshooting.
- **edge-sync** — Offline-first sync, CRDTs, delta sync, conflict resolution.
- **financial-modeling** — Money representation, budgeting, transaction logic, rounding.
- **kmp-development** — KMP project structure, expect/actual, SQLDelight, Gradle, multiplatform pitfalls.
- **privacy-compliance** — GDPR, CCPA, data minimization, consent, encryption, privacy by design.
- **supabase-powersync** — Supabase config, PostgreSQL schema, RLS, Edge Functions, PowerSync sync rules.

**How skills work:**

- Each skill is a directory under `.github/skills/` with a `SKILL.md` (YAML frontmatter + Markdown body).
- Skills are loaded by agents based on trigger keywords in the skill description.
- Skills are compatible with Copilot, Copilot Chat, and MCP agents.
- Skills can be extended or updated as the project evolves.

See [`docs/ai/skills.md`](skills.md) for full details and how to add new skills.

---

## Workflow Rules

AI agents follow strict workflow rules to ensure quality, security, and compliance:

- **Feature development:**
  1. Create a GitHub issue for the feature.
  2. Work locally with Copilot Chat (Agent Mode) or assign to `@copilot` for autonomous work.
  3. Request review from `@security-reviewer` and `@accessibility-reviewer` for relevant changes.
  4. Merge only after all checks pass.

- **Code review:**
  - Use specialized agents for review: `@security-reviewer`, `@accessibility-reviewer`, `@finance-domain`.
  - Address all flagged issues before human review.

- **Architecture decisions:**
  - Use `@architect` to create/update ADRs in `docs/architecture/`.
  - Update agent instructions if coding patterns change.

- **Documentation:**
  - `@docs-writer` maintains all documentation, onboarding, and AI workflow guides.
  - Reference [`docs/guides/workflow-cheatsheet.md`](../guides/workflow-cheatsheet.md) for quick workflow help.

- **Fleet mode:**
  - Use Copilot CLI `/fleet` for parallel agent execution on large, multi-part tasks.
  - Fleet orchestrator splits tasks, dispatches to agents, and aggregates results.

See [`docs/ai/workflow.md`](workflow.md) for detailed workflow guidance and troubleshooting.

---

## Instruction Files

Instruction files tell Copilot and other agents how to behave in specific parts of the repo. They live in `.github/instructions/` and use YAML frontmatter to scope rules.

- **Global:** `.github/copilot-instructions.md` — applies to all Copilot interactions.
- **Path-specific:** `.github/instructions/*.instructions.md` — applies to specific directories (e.g., `apps/**`, `packages/**`, `services/**`, `docs/**`, `tools/**`).
- **How loaded:**
  - Copilot loads global + matching path-specific instructions for any file being edited.
  - Instructions stack; more specific rules override general ones.

See [`docs/ai/instructions.md`](instructions.md) for details and how to add/update instructions.

---

## Fleet Mode & Parallelism

- Use `/fleet` in Copilot CLI to break large tasks into subtasks for parallel agent execution.
- Best for tasks with separable concerns (e.g., code + tests + docs).
- Monitor progress and review all PRs before merging.

---

## Human-Gated Operations

**All agents must NOT perform the following without explicit human approval:**

- Git remote operations (push, pull, fetch, merge from remote, rebase onto remote)
- PR/review operations (merge, close, approve PRs — creating PRs with linked issues IS allowed)
- Remote platform mutations (GitHub API writes, deployments, releases)
- File operations outside the repository root

**Instead:**

- For destructive file ops, name each file and explain why it should be deleted.
- For package publishing, prepare the release and ask a human to publish.
- For secrets/credentials, create `.env.example` with placeholders and document requirements.
- For database destructive ops, write the SQL, explain the impact, and ask a human to execute.

If a task requires a gated operation, agents must STOP, explain, and request human approval.

---

## Updating Agents, Skills, and Instructions

- **Add a new agent:** Create a new `.agent.md` in `.github/agents/` and update this document.
- **Add a new skill:** Create a new skill directory with `SKILL.md` in `.github/skills/` and update [`docs/ai/skills.md`](skills.md).
- **Update instructions:** Edit the relevant `.instructions.md` file in `.github/instructions/` and update [`docs/ai/instructions.md`](instructions.md).
- **Keep this document current** as new agent types, skills, or workflow rules are added.

---

**For more, see:**

- [`docs/ai/agents.md`](agents.md) — Full agent role definitions
- [`docs/ai/skills.md`](skills.md) — All available skills
- [`docs/ai/workflow.md`](workflow.md) — AI workflow and troubleshooting
- [`docs/ai/instructions.md`](instructions.md) — Instruction file structure

---

_Last updated: [auto-generated]_
