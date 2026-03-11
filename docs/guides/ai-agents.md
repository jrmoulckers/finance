# AI Agent Usage Guide

This guide explains how to use the 13 custom Copilot agents in the Finance monorepo, when to invoke each one, and how to combine them for complex workflows.

## Table of Contents

- [Quick Reference](#quick-reference)
- [Agent Profiles and Example Prompts](#agent-profiles-and-example-prompts)
- [Chaining Agents](#chaining-agents)
- [Fleet Mode for Parallel Work](#fleet-mode-for-parallel-work)
- [Using MCP Tools Effectively](#using-mcp-tools-effectively)
- [Common Pitfalls](#common-pitfalls)

## Quick Reference

| Agent                     | Role            | Best For                                             |
| ------------------------- | --------------- | ---------------------------------------------------- |
| `@architect`              | System design   | Cross-platform decisions, API contracts, ADRs        |
| `@docs-writer`            | Documentation   | Guides, READMEs, API docs, ADRs                      |
| `@security-reviewer`      | Security review | Auth, encryption, data handling, compliance          |
| `@accessibility-reviewer` | A11y review     | WCAG compliance, screen readers, motion              |
| `@finance-domain`         | Domain logic    | Money math, budgets, transactions, currencies        |
| `@kmp-engineer`           | Shared code     | KMP modules, SQLDelight, Gradle, expect/actual       |
| `@backend-engineer`       | Backend         | Supabase, PostgreSQL, RLS, PowerSync, Edge Functions |
| `@ios-engineer`           | iOS app         | SwiftUI, KMP integration, Keychain, VoiceOver        |
| `@android-engineer`       | Android app     | Jetpack Compose, Material 3, BiometricPrompt         |
| `@web-engineer`           | Web PWA         | Service workers, SQLite-WASM, ARIA, Web Crypto       |
| `@windows-engineer`       | Windows app     | Compose Desktop, Windows Hello, DPAPI, Narrator      |
| `@devops-engineer`        | CI/CD           | GitHub Actions, Turborepo, Fastlane, Changesets      |
| `@design-engineer`        | Design system   | Design tokens, Style Dictionary, color, typography   |

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

### `@kmp-engineer` — KMP Engineer

Expert on all shared Kotlin Multiplatform code in `packages/`. Owns Gradle configuration, SQLDelight schemas, expect/actual declarations, and cross-platform compatibility.

```
@kmp-engineer Add a new SQLDelight migration for the categories table with a parent_id column.
@kmp-engineer Create expect/actual declarations for platform-specific secure storage (Keychain, Keystore, DPAPI).
@kmp-engineer Why is commonMain pulling in java.time? Find and fix the platform leak.
```

### `@backend-engineer` — Backend Engineer

Owns the Supabase project — PostgreSQL schemas, Row-Level Security (RLS), Edge Functions, and PowerSync sync rules.

```
@backend-engineer Write an RLS policy that allows users to read only their own accounts and any shared household accounts.
@backend-engineer Create a Supabase Edge Function to handle webhook notifications from the bank aggregator.
@backend-engineer Configure PowerSync sync rules to selectively replicate only active budgets to the client.
```

### `@ios-engineer` — iOS Engineer

Builds the native Apple experience with SwiftUI. Integrates KMP shared logic via Swift Export or SKIE.

```
@ios-engineer Implement a transaction detail view in SwiftUI that consumes the KMP TransactionUseCase.
@ios-engineer Add Face ID / Touch ID authentication gating before showing account balances.
@ios-engineer Ensure the budget chart supports Dynamic Type and VoiceOver.
```

### `@android-engineer` — Android Engineer

Builds the Android and Wear OS clients with Jetpack Compose and Material 3. KMP modules are direct Kotlin dependencies.

```
@android-engineer Build a Compose navigation graph for the accounts → transactions → detail flow.
@android-engineer Integrate BiometricPrompt for app unlock with fallback to device credentials.
@android-engineer Add a Wear OS tile showing today's spending total.
```

### `@web-engineer` — Web Engineer

Builds the Progressive Web App (PWA) with offline-first capability using SQLite-WASM for local storage.

```
@web-engineer Set up the service worker for offline caching of the transaction list.
@web-engineer Configure SQLite-WASM with OPFS storage backend for persistent local data.
@web-engineer Implement keyboard navigation for the budget allocation form.
```

### `@windows-engineer` — Windows Engineer

Builds the Windows desktop client with Compose Desktop (JVM target), Windows Hello, and DPAPI secure storage.

```
@windows-engineer Add Windows Hello authentication with DPAPI fallback for credential storage.
@windows-engineer Ensure the main window supports Narrator and UI Automation patterns.
@windows-engineer Configure MSIX packaging for Microsoft Store distribution.
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
Step 2: @kmp-engineer Implement the shared KMP logic based on the architect's design.
Step 3: @backend-engineer Write the RLS policies and sync rules for the new shared budget tables.
Step 4: @security-reviewer Review the full implementation for data isolation and auth issues.
Step 5: @docs-writer Document the new feature in the architecture docs and update the API reference.
```

### Other Useful Chains

| Chain                                                                        | Use Case                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| `@finance-domain` → `@kmp-engineer`                                          | Design domain logic, then implement in shared code      |
| `@architect` → `@devops-engineer`                                            | Design a system change, then update CI/CD to support it |
| `@design-engineer` → `@web-engineer` + `@android-engineer` + `@ios-engineer` | Define tokens, then implement on each platform          |
| `@kmp-engineer` → `@security-reviewer` → `@accessibility-reviewer`           | Build, security-check, then accessibility-check         |

### Tips for Effective Chaining

- **Share context explicitly.** Paste the previous agent's output or reference the files it created: _"@kmp-engineer Implement the API contract from docs/architecture/adr-012-budget-sharing.md"_
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
2. Dispatches subtasks to the appropriate agents concurrently (e.g., `@kmp-engineer` for code, `@docs-writer` for docs, `@security-reviewer` for review)
3. Manages dependencies between subtasks
4. Aggregates results for human review

### Good Candidates for Fleet Mode

| Task Pattern                | Agents Dispatched                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------- |
| New feature end-to-end      | `@architect` + `@kmp-engineer` + `@android-engineer` + `@ios-engineer` + `@docs-writer` |
| Code + tests + docs         | `@kmp-engineer` + `@devops-engineer` + `@docs-writer`                                   |
| Cross-platform UI component | `@design-engineer` + `@android-engineer` + `@ios-engineer` + `@web-engineer`            |
| Security audit              | `@security-reviewer` + `@accessibility-reviewer` (parallel reviews)                     |

### Fleet Mode Best Practices

- **Describe the full scope** so the orchestrator partitions effectively
- **Monitor progress** — intervene if agents drift into overlapping files
- **Review all outputs** before merging, especially when agents touched shared files
- **Don't fleet trivial tasks** — the overhead of orchestration isn't worth it for single-file changes

## Using MCP Tools Effectively

MCP (Model Context Protocol) servers extend agent capabilities. Five servers are configured in `.vscode/mcp.json`:

| Server                  | What It Gives Agents                       | When to Use                                |
| ----------------------- | ------------------------------------------ | ------------------------------------------ |
| **GitHub**              | Issue/PR data, code search, Actions status | Referencing issues, checking CI status     |
| **Sequential Thinking** | Step-by-step chain-of-thought reasoning    | Complex debugging, architecture analysis   |
| **Memory**              | Persistent context across chat sessions    | Long-running tasks, maintaining decisions  |
| **Filesystem**          | Sandboxed file read/write/search           | Agents that need to browse or edit code    |
| **Context7**            | Live library/framework documentation       | Ensuring agents use current API signatures |

### Tips for MCP

- **Sequential Thinking for debugging** — When an agent's first answer seems wrong, ask it to "use sequential thinking to analyze this step by step." This activates the chain-of-thought MCP server for more methodical reasoning.
- **Memory for multi-session work** — If a task spans multiple Copilot Chat sessions, ask the agent to "save this decision to memory" so the next session picks up where you left off.
- **Context7 for up-to-date APIs** — If an agent suggests deprecated API usage, ask it to "check Context7 for the current API" to pull live documentation.

## Common Pitfalls

### 1. Using the wrong agent

**Problem:** Asking `@architect` to write implementation code or `@kmp-engineer` to design RLS policies.
**Fix:** Match the task to the agent's expertise. When unsure, check the [Quick Reference](#quick-reference) table.

### 2. Prompts that are too vague

**Problem:** _"@kmp-engineer fix the bug"_ — the agent doesn't know which bug, where, or what the expected behavior is.
**Fix:** Be specific: _"@kmp-engineer The BudgetEngine.rollover() function in packages/core/src/commonMain/.../BudgetEngine.kt throws an IndexOutOfBoundsException when the category list is empty. Add an empty-list guard and a test."_

### 3. Skipping the review agents

**Problem:** Shipping code without security or accessibility review.
**Fix:** Always run `@security-reviewer` on changes that touch financial data, auth, or encryption. Run `@accessibility-reviewer` on any UI change. This is especially important in a financial application.

### 4. Not providing context when chaining

**Problem:** Asking the next agent in a chain to "continue" without specifying what was decided.
**Fix:** Reference the concrete output: _"@kmp-engineer Implement the schema from the ADR that @architect just wrote in docs/architecture/adr-015.md"_

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
