# AI Agent Usage Guide

This guide explains how to use the 23 runtime Copilot agents in the Finance monorepo, when to invoke each one, and how to combine them for complex workflows. Twenty-two definitions are Studio-generated; `finance-domain` is Finance-authored.

## Table of Contents

- [Quick Reference](#quick-reference)
- [Agent Profiles and Example Prompts](#agent-profiles-and-example-prompts)
- [Chaining Agents](#chaining-agents)
- [Fleet Mode for Parallel Work](#fleet-mode-for-parallel-work)
- [Using MCP Tools Effectively](#using-mcp-tools-effectively)
- [Common Pitfalls](#common-pitfalls)

## Quick Reference

| Agent                     | Role            | Best For                                           |
| ------------------------- | --------------- | -------------------------------------------------- |
| `@architect`              | System design   | Cross-platform decisions, API contracts, ADRs      |
| `@docs-writer`            | Documentation   | Guides, READMEs, API docs, ADRs                    |
| `@security-reviewer`      | Security review | Auth, encryption, data handling, compliance        |
| `@accessibility-reviewer` | A11y review     | WCAG compliance, screen readers, motion            |
| `@finance-domain`         | Domain logic    | Money math, budgets, transactions, currencies      |
| `@native-app-engineer`    | Native/shared   | Android, iOS, Windows, KMP, SQLDelight, Gradle     |
| `@backend-engineer`       | Backend         | Supabase Auth, Edge Functions, API behavior        |
| `@database-engineer`      | Database        | PostgreSQL, RLS, migrations, PowerSync rules       |
| `@sre-engineer`           | Reliability     | SLOs, incidents, rollback, recovery verification   |
| `@web-engineer`           | Web PWA         | Service workers, SQLite-WASM, ARIA, Web Crypto     |
| `@devops-engineer`        | CI/CD           | GitHub Actions, Turborepo, Fastlane, Changesets    |
| `@design-engineer`        | Design system   | Design tokens, Style Dictionary, color, typography |

## Agent Profiles and Example Prompts

### `@architect` — System Architect

Designs high-level architecture, evaluates technology choices, and defines API contracts. Start here when a task spans multiple platforms or packages.

```
@architect How should we structure the sync protocol to handle offline conflict resolution for shared budgets?
@architect Evaluate whether we should use gRPC or REST for the sync API. Write an ADR with your recommendation.
@architect Review the data flow between packages/sync and services/api — are there any coupling concerns?
```

### `@docs-writer` — Documentation Writer

Creates and maintains all project documentation. Only modifies files in `docs/`, READMEs, and markdown files — never source code.

```
@docs-writer Update the README for packages/core to reflect the new budget engine module.
@docs-writer Write an ADR for our decision to use SQLDelight over Room for the shared database layer.
@docs-writer Create a getting-started guide for new contributors.
```

### `@security-reviewer` — Security & Privacy Reviewer

Reviews code for vulnerabilities, privacy violations, and regulatory compliance. Reports findings at four severity levels: CRITICAL, HIGH, MEDIUM, LOW.

```
@security-reviewer Review the authentication flow in packages/sync/src/commonMain for security issues.
@security-reviewer Audit the RLS policies in services/api — can a user access another user's transactions?
@security-reviewer Check this PR for hardcoded secrets or credentials.
```

### `@accessibility-reviewer` — Accessibility Reviewer

Ensures UI code meets WCAG 2.2 AA standards and platform accessibility guidelines.

```
@accessibility-reviewer Check the transaction list component for VoiceOver and TalkBack compatibility.
@accessibility-reviewer Review the color contrast ratios in our budget progress bars.
@accessibility-reviewer Does this animation respect the user's reduced-motion preference?
```

### `@finance-domain` — Financial Domain Expert

Ensures correctness of financial logic — money representation, budgeting algorithms, and transaction processing. The golden rule: **never use floating point for money**.

```
@finance-domain Review this budget rollover calculation — does it handle partial-month periods correctly?
@finance-domain How should we implement split transactions where the sum of splits must equal the parent amount?
@finance-domain Design the data model for recurring transactions with flexible frequency options.
```

### `@native-app-engineer` — Native App Engineer

Leads Android, iOS, Windows, and shared Kotlin Multiplatform structure. Owns Gradle configuration, client SQLDelight schemas, expect/actual declarations, and native platform integration.

```
@native-app-engineer Add a SQLDelight migration and matching client models for categories.
@native-app-engineer Create expect/actual secure-storage declarations for Keychain, Keystore, and DPAPI.
@native-app-engineer Build the budget screen natively on Android, iOS, and Windows with platform accessibility.
```

### `@backend-engineer` — Backend Engineer

Owns Supabase Auth, Edge Functions, API behavior, OpenAPI, validation, CORS, and rate limiting.

```
@backend-engineer Create a Supabase Edge Function to handle webhook notifications from the bank aggregator.
@backend-engineer Review the auth and request-validation contract for the sync API.
```

### `@database-engineer` — Database Engineer

Owns PostgreSQL schema, reversible migrations, Row-Level Security, seed/tests, and PowerSync rules.

```
@database-engineer Write and test RLS policies for owner and household access.
@database-engineer Add the reversible Supabase migration and coordinate the client SQLDelight schema.
@database-engineer Configure PowerSync rules to replicate only authorized active budgets.
```

### `@sre-engineer` — SRE Engineer

Owns service-level objectives, monitoring semantics, incident response, capacity, rollback, disaster recovery, and restore verification.

```
@sre-engineer Define sync freshness and API availability SLOs with actionable alerts.
@sre-engineer Review the rollback and restore-verification runbook for this migration.
```

### `@web-engineer` — Web Engineer

Builds the Progressive Web App (PWA) with offline-first capability using SQLite-WASM for local storage.

```
@web-engineer Set up the service worker for offline caching of the transaction list.
@web-engineer Configure SQLite-WASM with OPFS storage backend for persistent local data.
@web-engineer Implement keyboard navigation for the budget allocation form.
```

### `@devops-engineer` — DevOps Engineer

Designs and maintains CI/CD pipelines, Turborepo configuration, and release automation.

```
@devops-engineer Create a GitHub Actions workflow that runs KMP tests on all targets (JVM, Android, iOS sim, JS).
@devops-engineer Add a Changeset entry for the new budget feature so the changelog updates on release.
@devops-engineer Why is the Turborepo cache missing for :packages:core:jvmTest? Check the pipeline config.
```

### `@design-engineer` — Design Engineer

Defines the design token system, Style Dictionary pipeline, and accessibility-first component specifications.

```
@design-engineer Create semantic color tokens for budget status (on-track, warning, over-budget) with AA contrast.
@design-engineer Configure Style Dictionary to output Compose theme values and SwiftUI Color extensions.
@design-engineer Spec the transaction amount input component with accessibility contract and states.
```

## Chaining Agents

For complex features, chain agents in sequence. Each agent's output becomes context for the next.

### Recommended Chain: Design → Build → Review

```
Step 1: @architect Design the data model and API contract for budget sharing between household members.
Step 2: @database-engineer Write the PostgreSQL migration, RLS policies, and PowerSync rules.
Step 3: @native-app-engineer Implement the shared KMP logic and client SQLDelight schema.
Step 4: @security-reviewer Review the full implementation for data isolation and auth issues.
Step 5: @docs-writer Document the new feature in the architecture docs and update the API reference.
```

### Other Useful Chains

| Chain                                                                     | Use Case                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------- |
| `@finance-domain` → `@native-app-engineer`                                | Design domain logic, then implement in shared code      |
| `@architect` → `@devops-engineer`                                         | Design a system change, then update CI/CD to support it |
| `@design-engineer` → `@web-engineer` + `@native-app-engineer`             | Define tokens, then implement on every platform         |
| `@native-app-engineer` → `@security-reviewer` → `@accessibility-reviewer` | Build, security-check, then accessibility-check         |

### Tips for Effective Chaining

- **Share context explicitly.** Paste the previous agent's output or reference the files it created: _"@native-app-engineer Implement the API contract from docs/architecture/adr-012-budget-sharing.md"_
- **Keep scope narrow.** Each agent works best with a focused task — don't ask one agent to "do everything."
- **Review between steps.** Verify each agent's output before feeding it to the next. Errors compound when passed down the chain.

## Fleet Mode for Parallel Work

Fleet mode uses Copilot CLI's `/fleet` command to run multiple agents in parallel. This is ideal for tasks with naturally separable concerns.

### How to Use Fleet

```bash
# In Copilot CLI (requires Pro+ subscription)
/fleet implement transaction categorization with tests, docs, and security review
```

The fleet orchestrator automatically:

1. Decomposes the task into subtasks
2. Dispatches subtasks to the appropriate agents concurrently (e.g., `@native-app-engineer` for native/shared code, `@docs-writer` for docs, `@security-reviewer` for review)
3. Manages dependencies between subtasks
4. Aggregates results for human review

### Good Candidates for Fleet Mode

| Task Pattern                | Agents Dispatched                                                        |
| --------------------------- | ------------------------------------------------------------------------ |
| New feature end-to-end      | `@architect` + `@native-app-engineer` + `@web-engineer` + `@docs-writer` |
| Code + tests + docs         | `@native-app-engineer` + `@devops-engineer` + `@docs-writer`             |
| Cross-platform UI component | `@design-engineer` + `@native-app-engineer` + `@web-engineer`            |
| Security audit              | `@security-reviewer` + `@accessibility-reviewer` (parallel reviews)      |

### Fleet Mode Best Practices

- **Describe the full scope** so the orchestrator partitions effectively
- **Monitor progress** — intervene if agents drift into overlapping files
- **Review all outputs** before merging, especially when agents touched shared files
- **Don't fleet trivial tasks** — the overhead of orchestration isn't worth it for single-file changes

## Using MCP Tools Effectively

MCP (Model Context Protocol) servers extend agent capabilities. Seven servers are configured in `.vscode/mcp.json`:

| Server                  | What It Gives Agents                                       | When to Use                                |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| **GitHub**              | Issue/PR data, code search, Actions status                 | Referencing issues, checking CI status     |
| **Sequential Thinking** | Step-by-step chain-of-thought reasoning                    | Complex debugging, architecture analysis   |
| **Memory**              | Persistent context across chat sessions                    | Long-running tasks, maintaining decisions  |
| **Filesystem**          | File read/write/search under a dedicated, secret-free root | Agents that need to browse or edit code    |
| **Context7**            | Live library/framework documentation                       | Ensuring agents use current API signatures |
| **Supabase**            | Read-only Supabase schema/data inspection                  | Checking DB schema or data (read-only)     |
| **Playwright**          | Browser automation & E2E test authoring                    | Driving UI flows, debugging E2E tests      |

> ⚠️ `filesystem` and `supabase` are **disabled for unattended/CI agents** and require least-privilege scoping. See [`mcp.md`](../ai/mcp.md) for the full tool-permission matrix, token scopes, and prompt-injection cautions.

### Tips for MCP

- **Sequential Thinking for debugging** — When an agent's first answer seems wrong, ask it to "use sequential thinking to analyze this step by step." This activates the chain-of-thought MCP server for more methodical reasoning.
- **Memory for multi-session work** — If a task spans multiple Copilot Chat sessions, ask the agent to "save this decision to memory" so the next session picks up where you left off.
- **Context7 for up-to-date APIs** — If an agent suggests deprecated API usage, ask it to "check Context7 for the current API" to pull live documentation.

## Common Pitfalls

### 1. Using the wrong agent

**Problem:** Asking `@architect` to write implementation code or `@native-app-engineer` to design RLS policies.
**Fix:** Match the task to the agent's expertise. When unsure, check the [Quick Reference](#quick-reference) table.

### 2. Prompts that are too vague

**Problem:** _"@native-app-engineer fix the bug"_ — the agent doesn't know which bug, where, or what the expected behavior is.
**Fix:** Be specific: _"@native-app-engineer The BudgetEngine.rollover() function in packages/core/src/commonMain/.../BudgetEngine.kt throws an IndexOutOfBoundsException when the category list is empty. Add an empty-list guard and a test."_

### 3. Skipping the review agents

**Problem:** Shipping code without security or accessibility review.
**Fix:** Always run `@security-reviewer` on changes that touch financial data, auth, or encryption. Run `@accessibility-reviewer` on any UI change. This is especially important in a financial application.

### 4. Not providing context when chaining

**Problem:** Asking the next agent in a chain to "continue" without specifying what was decided.
**Fix:** Reference the concrete output: _"@native-app-engineer Implement the client schema from the ADR that @architect just wrote in docs/architecture/adr-015.md"_

### 5. Trusting agent output without verification

**Problem:** Merging agent-generated code without running tests or reading the diff.
**Fix:** All agent output is a starting point. Run `./gradlew check` before committing. Read every line of generated code, especially financial calculations — the `@finance-domain` agent's golden rule (no floating point for money) must be manually verified.

### 6. Asking agents to bypass restrictions

**Problem:** Asking an agent to push to `main`, publish a package, or run destructive database commands.
**Fix:** Agents follow [human-gated operation rules](../../AGENTS.md). If you need a gated operation, the agent will stop and ask for your approval. Run the command yourself after reviewing.

## Further Reading

- [Agent definitions and configuration](../ai/agents.md)
- [MCP server setup and details](../ai/mcp.md)
- [AI development workflow](../ai/workflow.md)
- [Agent skills reference](../ai/skills.md)
- [Human-gated operation restrictions](../ai/restrictions.md)
