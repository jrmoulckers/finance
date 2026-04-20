# Custom Copilot Agents — Finance

Custom agents are specialized AI personas defined in `.github/agents/`. Each agent has a specific role, set of tools, and boundaries that focus its expertise on a particular aspect of development.

## How Agents Work

1. Agent definitions live in `.github/agents/<name>.agent.md`
2. Each file contains YAML frontmatter (name, description, tools) and a Markdown body with detailed instructions
3. Copilot loads the relevant agent when invoked by name in chat (e.g., `@architect`)
4. The GitHub Copilot Coding Agent can also use these definitions when working on issues autonomously

## Available Agents

### `@architect` — System Architect

**File:** `.github/agents/architect.agent.md`

**Purpose:** Designs high-level architecture, evaluates technology choices, defines API contracts, and ensures edge-first design principles.

**When to use:**

- Making cross-platform architecture decisions
- Designing the sync protocol or API contracts
- Evaluating new technologies or dependencies
- Creating Architecture Decision Records (ADRs)
- Reviewing changes that span multiple apps or packages

**Tools:** read, edit, search, shell

---

### `@docs-writer` — Documentation Writer

**File:** `.github/agents/docs-writer.agent.md`

**Purpose:** Creates and maintains all project documentation — architecture docs, AI guides, API references, and contributor guides.

**When to use:**

- Writing or updating README files
- Creating Architecture Decision Records
- Documenting API endpoints
- Updating AI workflow documentation
- Writing onboarding guides

**Tools:** read, edit, search

---

### `@security-reviewer` — Security & Privacy Reviewer

**File:** `.github/agents/security-reviewer.agent.md`

**Purpose:** Reviews code for security vulnerabilities, privacy violations, and regulatory compliance. For CRITICAL/HIGH severity issues, implements fixes directly. Critical for a financial application.

**When to use:**

- Reviewing PRs that handle financial data
- Adding authentication or authorization logic
- Integrating third-party services
- Handling encryption or key management
- Any change touching user data storage or transmission

**Tools:** read, search, shell

**Severity levels:**

- **CRITICAL** — Must fix before merge (data exposure risk)
- **HIGH** — Should fix before merge (significant weakness)
- **MEDIUM** — Fix within sprint (defense-in-depth)
- **LOW** — Address when convenient (best practice)

---

### `@accessibility-reviewer` — Accessibility Reviewer

**File:** `.github/agents/accessibility-reviewer.agent.md`

**Purpose:** Reviews UI code for WCAG 2.2 AA compliance, platform accessibility guidelines, and inclusive design. Inspired by Tiimo's disability-inclusive approach.

**When to use:**

- Any UI component creation or modification
- Navigation flow changes
- Color/theme changes
- Adding animations or motion
- Creating forms or interactive elements

**Tools:** read, search

**Key standards:** WCAG 2.2 AA, Apple HIG Accessibility, Material Design Accessibility, WAI-ARIA

---

### `@finance-domain` — Financial Domain Expert

**File:** `.github/agents/finance-domain.agent.md`

**Purpose:** Ensures financial logic correctness — budgeting algorithms, transaction processing, currency handling, and reporting accuracy.

**When to use:**

- Implementing budgeting logic
- Handling monetary calculations
- Designing transaction processing flows
- Working on financial reporting/analytics
- Multi-currency support
- Shared/family finance features

**Tools:** read, edit, search

**Critical rule:** Never use floating point for money. Use integer cents or fixed-precision decimals.

---

### `@kmp-engineer` — KMP Engineer

**File:** `.github/agents/kmp-engineer.agent.md`

**Purpose:** Expert on all Kotlin Multiplatform shared code in `packages/` — business logic, SQLDelight database schemas, Ktor client networking, kotlinx libraries, and Gradle KMP configuration across all targets.

**When to use:**

- Writing or modifying shared KMP code in `packages/`
- Creating SQLDelight schemas (`.sq` files) and migrations
- Configuring Gradle for KMP targets (iOS, Android, JVM, JS, Wasm)
- Implementing expect/actual declarations for platform-specific APIs
- Reviewing shared code for platform compatibility

**Tools:** read, edit, search, shell

---

### `@backend-engineer` — Backend Engineer

**File:** `.github/agents/backend-engineer.agent.md`

**Purpose:** Owns the Supabase project (PostgreSQL, Auth, Edge Functions, RLS) and PowerSync sync engine, ensuring secure data flow between edge clients and the cloud.

**When to use:**

- Designing or modifying PostgreSQL schemas
- Writing or reviewing Row-Level Security (RLS) policies
- Configuring PowerSync sync rules
- Implementing Supabase Edge Functions
- Managing database migrations

**Tools:** read, edit, search, shell

---

### `@ios-engineer` — iOS Engineer

**File:** `.github/agents/ios-engineer.agent.md`

**Purpose:** Builds and maintains the native Apple platform experience (iPhone, iPad, Mac, Apple Watch, App Clips) using SwiftUI, with KMP integration via Swift Export.

**When to use:**

- Building or modifying SwiftUI views in `apps/ios/`
- Integrating KMP shared logic via Swift Export or SKIE
- Implementing Apple Keychain, Face ID, or Touch ID features
- Ensuring VoiceOver and Dynamic Type accessibility
- Configuring Xcode project settings or watchOS companion app

**Tools:** read, edit, search, shell

---

### `@android-engineer` — Android Engineer

**File:** `.github/agents/android-engineer.agent.md`

**Purpose:** Builds and maintains the Android and Wear OS clients using Jetpack Compose with Material 3, integrating shared KMP business logic with native security and accessibility.

**When to use:**

- Building or modifying Jetpack Compose UI
- Integrating KMP modules as direct Kotlin dependencies
- Implementing BiometricPrompt and Android Keystore
- Ensuring TalkBack and Switch Access compatibility
- Building the Wear OS companion app

**Tools:** read, edit, search, shell

---

### `@web-engineer` — Web Engineer

**File:** `.github/agents/web-engineer.agent.md`

**Purpose:** Builds and maintains the Progressive Web App with offline-first capability, integrating KMP shared logic via Kotlin/JS or WASM bindings, with SQLite-WASM for local storage.

**When to use:**

- Building or modifying the PWA in `apps/web/`
- Configuring service workers and offline caching
- Setting up SQLite-WASM with OPFS storage
- Implementing ARIA accessibility and keyboard navigation
- Configuring Web Crypto API for client-side encryption

**Tools:** read, edit, search, shell

---

### `@windows-engineer` — Windows Engineer

**File:** `.github/agents/windows-engineer.agent.md`

**Purpose:** Builds and maintains the Windows desktop client using Compose Desktop (JVM target) with Windows Hello authentication, DPAPI secure storage, and Narrator accessibility. **Windows is a first-class beta target** — it ships alongside Android, iOS, and Web, mirroring Android's Koin DI + ViewModel + Repository architecture.

**When to use:**

- Building or modifying Compose Desktop UI for Windows in `apps/windows/`
- Implementing Windows Hello biometric authentication
- Using DPAPI for secure credential storage
- Ensuring Narrator and UI Automation accessibility
- Packaging MSIX for Microsoft Store distribution
- Setting up Koin DI modules or ViewModel infrastructure for Windows

**Tools:** read, edit, search, shell

---

### `@devops-engineer` — DevOps Engineer

**File:** `.github/agents/devops-engineer.agent.md`

**Purpose:** Designs and maintains CI/CD pipelines using GitHub Actions, Turborepo monorepo builds, Fastlane mobile deployment, Changesets versioning, and release automation.

**When to use:**

- Authoring or modifying GitHub Actions workflows
- Configuring Turborepo pipelines and caching
- Setting up Fastlane lanes for iOS/Android
- Managing Changesets for versioning and changelogs
- Configuring dependency scanning (Dependabot, CodeQL)

**Tools:** read, edit, search, shell

---

### `@design-engineer` — Design Engineer

**File:** `.github/agents/design-engineer.agent.md`

**Purpose:** Defines and maintains the design token system (DTCG spec), Style Dictionary pipeline, color systems, typography scales, and accessibility-first component specifications across all platforms.

**When to use:**

- Defining or modifying design tokens (primitives, semantic, component)
- Configuring Style Dictionary transforms for platform outputs
- Designing color systems with WCAG AA compliance
- Creating component specifications with accessibility contracts
- Establishing financial data visualization patterns

**Tools:** read, edit, search

---

### `@product-manager` — Product Manager

**File:** `.github/agents/product-manager.agent.md`

**Purpose:** Owns the product roadmap, plans sprints, triages issues, grooms the backlog, and coordinates work across all agent types so engineering, design, and business priorities stay aligned.

**When to use:**

- Planning sprints and decomposing work across agent types
- Triaging and prioritizing issues (P0–P3 framework)
- Grooming the backlog and managing stale issues
- Tracking platform parity across iOS, Android, Web, Windows
- Coordinating fleet dispatch for parallel agent work

**Tools:** read, search, shell

---

### `@marketing-strategist` — Marketing Strategist

**File:** `.github/agents/marketing-strategist.agent.md`

**Purpose:** Develops go-to-market strategy, crafts brand messaging, optimizes app store presence, and drives user acquisition — all while maintaining privacy-first, non-manipulative values.

**When to use:**

- Writing or updating app store listings for all four platforms
- Creating launch communication materials
- Developing content calendars and blog post drafts
- Defining user acquisition strategy and channels
- Drafting privacy-focused messaging

**Tools:** read, edit, search

---

### `@business-analyst` — Business Analyst

**File:** `.github/agents/business-analyst.agent.md`

**Purpose:** Defines pricing strategy, benchmarks against competitors, models revenue, and designs freemium tier boundaries. Bridges product vision and sustainable business outcomes.

**When to use:**

- Defining and validating pricing tiers and feature gating
- Benchmarking pricing against YNAB, Monarch, Copilot, and others
- Creating revenue projections and unit economics models
- Designing freemium boundaries that drive conversion
- Evaluating subscription platform options

**Tools:** read, edit, search

---

## Agent Management & Coordination

### File Ownership

Each agent has primary ownership over a set of directories. When multiple agents run in parallel (fleet mode), only the owning agent edits files in its area:

| Agent                     | Primary ownership                                                  |
| ------------------------- | ------------------------------------------------------------------ |
| `@kmp-engineer`           | `packages/`                                                        |
| `@backend-engineer`       | `services/api/`                                                    |
| `@web-engineer`           | `apps/web/`                                                        |
| `@android-engineer`       | `apps/android/`                                                    |
| `@ios-engineer`           | `apps/ios/`                                                        |
| `@windows-engineer`       | `apps/windows/`                                                    |
| `@design-engineer`        | `config/tokens/`, generated token files                            |
| `@devops-engineer`        | `.github/workflows/`, `build-logic/`, `tools/`                     |
| `@docs-writer`            | `docs/`, root `*.md` files                                         |
| `@security-reviewer`      | Security fixes in any directory; review-only for non-security code |
| `@accessibility-reviewer` | Read-only review — never edits production code                     |
| `@architect`              | `docs/architecture/`, ADRs; read-only for code                     |
| `@finance-domain`         | `packages/core/` business logic (shared with `@kmp-engineer`)      |
| `@product-manager`        | `docs/business/`, GitHub Issues (read/create)                      |
| `@marketing-strategist`   | `docs/marketing/`, app store copy drafts                           |
| `@business-analyst`       | `docs/business/`, pricing/revenue docs                             |

**Shared config** (`gradle/libs.versions.toml`, `settings.gradle.kts`, `package.json`, `turbo.json`) — one agent per run. Assign to `@kmp-engineer` (Gradle) or `@devops-engineer` (Node/CI).

### Escalation Path

1. **Re-read the relevant skill** — the answer may already be documented
2. **Consult `@architect`** — for cross-cutting or ambiguous design decisions
3. **Stop and document** — add `## Needs Decision: <question>` to the PR; do NOT guess on financial logic

### Adding a New Agent

1. Create `.github/agents/<name>.agent.md` with YAML frontmatter:
   ```yaml
   ---
   name: <agent-name>
   description: >
     Clear description of the agent's purpose and when to use it.
   tools:
     - read
     - edit
     - search
   ---
   ```
2. Write the Markdown body with: Mission, Expertise Areas, Key Responsibilities, and Boundaries
3. Update this document (`docs/ai/agents.md`) with the new agent's details
4. Test the agent by invoking it in Copilot Chat

## Best Practices

- **Invoke the right agent** — Use `@security-reviewer` for security reviews, not generic Copilot
- **Combine agents** — Ask `@architect` to design, then `@security-reviewer` to review
- **Trust but verify** — Agent output is a starting point; always review critically
- **Update agents** — As the project evolves, update agent instructions to reflect new patterns
- **Respect file ownership** — In fleet runs, each agent owns its directory; avoid cross-agent edits to the same file
- **Serialize schema work** — `@backend-engineer` writes Supabase migrations; `@kmp-engineer` writes SQLDelight schemas; coordinate as a pair, not independently
- **Never guess on money** — Financial logic decisions must be human-approved; agents should stop and document rather than assume

## Agent Workflow (MANDATORY)

Every agent MUST follow this pre-push sequence before every `git push`:

1. `npm run format && npx eslint . --fix` — auto-fix all issues
2. `npm run format:check && npx eslint . --max-warnings 0` — verify clean
3. `git add -A && git commit --amend --no-edit` — amend commit with fixes
4. `$env:HUSKY = "0" ; git push --no-verify origin <branch>` — push (bypass pre-push hook)
5. `gh pr create` with `Closes #N` — create PR immediately

**Pushing and creating PRs is auto-approved and mandatory.** Stopping at a local commit without a PR is a workflow violation.

For docs-only PRs, use: `npm run ci:check:quick`

### Available Tooling

| Command                     | Purpose                                       |
| --------------------------- | --------------------------------------------- |
| `npm run format`            | Auto-fix Prettier formatting                  |
| `npx eslint . --fix`        | Auto-fix ESLint issues                        |
| `npm run ci:check`          | Full check: format + lint + type-check        |
| `npm run ci:check:quick`    | Quick check for docs-only PRs                 |
| `npm run cleanup:worktrees` | Remove stale/merged worktrees                 |
| `npm run ready-for-pr`      | Final validation before marking work complete |

**CI notes:**

- **Kotlin linting** is handled by **detekt** in CI (not ESLint/Prettier)
- **`.prettierignore`** covers non-JS source files (Kotlin, Swift, etc.)
- **16 agents** are defined in `.github/agents/`
