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

**Purpose:** Reviews code for security vulnerabilities, privacy violations, and regulatory compliance. Critical for a financial application.

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

## Agent Management & Coordination

### File Ownership

Each agent has primary ownership over a set of directories. When multiple agents run in parallel (fleet mode), only the owning agent edits files in its area:

| Agent | Primary ownership |
|---|---|
| `@kmp-engineer` | `packages/` |
| `@backend-engineer` | `services/api/` |
| `@web-engineer` | `apps/web/` |
| `@android-engineer` | `apps/android/` |
| `@ios-engineer` | `apps/ios/` |
| `@windows-engineer` | `apps/windows/` |
| `@design-engineer` | `config/tokens/`, generated token files |
| `@devops-engineer` | `.github/workflows/`, `build-logic/`, `tools/` |
| `@docs-writer` | `docs/`, root `*.md` files |
| `@security-reviewer` | Read-only — never edits production code |
| `@accessibility-reviewer` | Read-only — never edits production code |

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
