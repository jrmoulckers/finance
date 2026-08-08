# Custom Copilot Agents — Finance

Custom agents are specialized AI personas defined in `.github/agents/`. Each agent has a specific role, set of tools, and boundaries that focus its expertise on a particular aspect of development.

## How Agents Work

1. Agent definitions live in `.github/agents/<name>.agent.md`
2. Each file contains YAML frontmatter (`name`, `description`, `model`, `when_to_use`, `primary_paths`, `write_scope`, `risk_level`, `tools`) and a Markdown body with the standard sections (Role, Capabilities, File Ownership, Workflow, Planning & Verification, Technical Context, Boundaries, Human-Gated Operations) — see [`agents.instructions.md`](../../.github/instructions/agents.instructions.md)
3. Copilot loads the relevant agent when invoked by name in chat (e.g., `@architect`)
4. The GitHub Copilot Coding Agent can also use these definitions when working on issues autonomously

## Available Agents

> **Source of truth:** the `*.agent.md` files in [`.github/agents/`](../../.github/agents/). There are **23 agents**: 22 provenance-stamped Studio-generated definitions plus the local `finance-domain`. Run `npm run ai:manifest:check` to validate the exact roster and sync inventory.
>
> **Reviewer roles are asymmetric:** `accessibility-reviewer` is **review-only** (routes fixes to the owning platform agent); `security-reviewer` is the **emergency fixer** (may implement CRITICAL/HIGH security fixes in any directory, with owning-agent coordination).

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

**Tools:** read, edit, search, shell

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

### `@compliance-specialist` — Compliance Specialist

**File:** `.github/agents/compliance-specialist.agent.md`

**Purpose:** Owns Finance's regulatory and legal compliance posture for user financial data — financial-services regulation, governmental/tax reporting, and regional data-protection regimes (GDPR, UK-GDPR, CCPA/CPRA, PIPEDA, LGPD). Advisory: defines the obligation matrix and routes implementation to the owning agent. Stewards the existing `docs/compliance/` corpus.

**When to use:**

- Mapping a feature to its regulatory obligations across jurisdictions
- Data-residency and cross-border transfer questions
- Data-retention and record-keeping schedules
- DPIA / RoPA authoring and audit-readiness
- Consent-language and regulatory-disclosure review

**Tools:** read, edit, search, shell

**Boundary:** Owns regulatory _obligations_ and the jurisdictional matrix; `@security-reviewer` owns the _technical controls_ that satisfy them and `@accessibility-reviewer` maintains the VPAT. Not legal counsel — flags items needing formal legal sign-off.

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

**Tools:** read, edit, search, shell

**Critical rule:** Never use floating point for money. Use integer cents or fixed-precision decimals.

---

### `@native-app-engineer` — Native App Engineer

**File:** `.github/agents/native-app-engineer.agent.md`

**Purpose:** Leads Android, iOS, Windows, and shared KMP structure while preserving each platform's native conventions and the staged iOS Swift Export boundary.

**When to use:**

- Building Android Compose, iOS SwiftUI, or Windows Compose Desktop features
- Writing shared KMP code, SQLDelight schemas, and `expect`/`actual` declarations
- Configuring Gradle targets and shared native dependencies
- Preserving TalkBack, VoiceOver, Narrator, keyboard, and native security contracts

**Tools:** read, edit, search, shell

---

### `@backend-engineer` — Backend Engineer

**File:** `.github/agents/backend-engineer.agent.md`

**Purpose:** Leads Supabase Auth, Edge Functions, API behavior, OpenAPI, validation, CORS, and rate limiting. Database schema and PowerSync rules route to `@database-engineer`.

**When to use:**

- Implementing Supabase Edge Functions
- Designing authentication and API behavior
- Maintaining OpenAPI, validation, CORS, and rate limiting
- Coordinating database changes with `@database-engineer`

**Tools:** read, edit, search, shell

---

### `@database-engineer` — Database Engineer

**File:** `.github/agents/database-engineer.agent.md`

**Purpose:** Owns PostgreSQL schema, reversible migrations, RLS, seed data, database tests, PowerSync rules, and database backup/volume definitions.

**When to use:**

- Designing or modifying PostgreSQL schemas and reversible migrations
- Writing and testing RLS policies for owner and household access
- Configuring PowerSync sync rules
- Coordinating client SQLDelight changes with `@native-app-engineer`

**Tools:** read, edit, search, shell

---

### `@sre-engineer` — SRE Engineer

**File:** `.github/agents/sre-engineer.agent.md`

**Purpose:** Owns SLOs, monitoring semantics, incident response, capacity, rollback, disaster recovery, and backup/restore verification.

**When to use:**

- Defining SLOs, alerts, and reliability signals
- Writing incident, rollback, and disaster-recovery runbooks
- Reviewing capacity and failure-mode behavior
- Verifying backup and restore procedures in approved non-production environments

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

## Single-Bug Task Mode

`.github/prompts/bug-bash.prompt.md` provides the full-lifecycle, platform-agnostic single-bug workflow without a permanent runtime role. It infers the affected surface, fixes shared code once or routes native/web implementation to the active owner, and follows the issue-to-merged-PR lifecycle.

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

**Tools:** read, edit, search, shell

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

**Tools:** read, edit, search, shell

---

### `@ai-ops-engineer` — AI Ops Engineer

**File:** `.github/agents/ai-ops-engineer.agent.md`

**Purpose:** Owns the AI configuration surface — agent definitions, skills, path instructions, prompts, evals, and the generated AI manifest. Keeps the roster coherent and self-consistent.

**When to use:**

- Adding, editing, or auditing `.github/agents/`, `.github/skills/`, `.github/instructions/`, `.github/prompts/`
- Designing prompt templates, agent hand-offs, and evals
- Regenerating the AI manifest after roster/skill changes

**Tools:** read, edit, search, shell

---

### `@release-manager` — Release Manager

**File:** `.github/agents/release-manager.agent.md`

**Purpose:** Runs Changesets/semver versioning, authors release notes and changelogs, and prepares store submissions (submission stays human-gated).

**When to use:**

- Adding Changeset entries and updating changelogs
- Drafting user-facing and technical release notes
- Sequencing a multi-platform release and go/no-go readiness

**Tools:** read, edit, search, shell

---

### `@performance-engineer` — Performance Engineer

**File:** `.github/agents/performance-engineer.agent.md`

**Purpose:** Owns performance budgets, cross-platform profiling, benchmarking, and regression triage (Core Web Vitals, startup, bundle size).

**When to use:**

- Defining or tuning `performance.budget.json`
- Investigating LCP/INP/CLS, startup, or bundle-size regressions
- Setting up profiling/benchmark configs

**Tools:** read, edit, search, shell

---

### `@data-engineer` — Data Engineer

**File:** `.github/agents/data-engineer.agent.md`

**Purpose:** Designs privacy-preserving **product analytics** — event schemas, taxonomy, and the metrics catalog. Owns the schema/catalog (in `docs/analytics/` + `config/analytics/`, net-new) and co-owns the telemetry files in `packages/core/.../analytics/`. Not to be confused with financial reporting/insights, which belong to `@finance-domain`/platform agents.

**When to use:**

- Defining or versioning analytics event schemas and taxonomy
- Designing consent-gated, PII-free metrics and the metrics catalog
- Co-designing client emission (with `@native-app-engineer`) and storage contracts (with `@database-engineer`)

**Tools:** read, edit, search, shell

---

### `@experimentation-engineer` — Experimentation Engineer

**File:** `.github/agents/experimentation-engineer.agent.md`

**Purpose:** Owns feature flags, A/B tests, staged rollouts, and experiment readouts. Leads `config/feature-flags/`; pairs with `@data-engineer` on success metrics and `@devops-engineer` on validation CI.

**When to use:**

- Adding or ramping a feature flag (`flags.json`) with rollout % and expiry
- Designing an A/B test or holdout (hypothesis, variants, guardrails)
- Reading out an experiment and deciding ship/hold/rollback

**Tools:** read, edit, search, shell

---

### `@localization-engineer` — Localization Engineer

**File:** `.github/agents/localization-engineer.agent.md`

**Purpose:** Owns i18n/l10n — locale catalogs, string-key conventions, the financial-terminology glossary, and formatting (currency/date/number, pluralization, RTL readiness). Leads `config/i18n/` + `docs/i18n/` (net-new); platform string code stays with platform/KMP agents.

**When to use:**

- Defining locale packs, string keys, and the financial-terminology glossary
- Reviewing currency/date/number formatting and pluralization
- Assessing text expansion and right-to-left readiness

**Tools:** read, edit, search, shell

---

### `@qa-tester` — QA Tester

**File:** `.github/agents/qa-tester.agent.md`

**Purpose:** Orchestrates live testing sessions, discovers and investigates bugs, and files well-scoped GitHub issues. **Read-only on code** — never modifies production code; hands off to `@product-manager` for prioritization.

**When to use:**

- Running an interactive testing session across web/iOS/Android/Windows
- Triaging console errors and scoping bugs (platform duplicates) before filing
- Dispatching parallel investigation agents for reported bugs

**Tools:** read, search, shell

---

## Agent Management & Coordination

### File Ownership

Each agent has primary ownership over a set of directories. When multiple agents run in parallel (fleet mode), only the owning agent edits files in its area:

| Agent                       | Primary ownership                                                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@native-app-engineer`      | `apps/android/`, `apps/ios/`, `apps/windows/`, shared `packages/`, Gradle config                                                                                        |
| `@backend-engineer`         | Edge Functions, Auth/API behavior, OpenAPI, validation, rate limiting                                                                                                   |
| `@database-engineer`        | Supabase migrations/RLS/tests/seed, PowerSync rules, database backup/volume definitions                                                                                 |
| `@sre-engineer`             | SLOs, monitoring semantics, incidents, capacity, rollback, recovery verification                                                                                        |
| `@web-engineer`             | `apps/web/`                                                                                                                                                             |
| `@design-engineer`          | `packages/design-tokens/` (token sources, Style Dictionary config + outputs)                                                                                            |
| `@devops-engineer`          | `.github/workflows/`, `build-logic/`, `tools/`, `scripts/`, `deploy/`, `gradle/wrapper/`, `config/detekt/`                                                              |
| `@docs-writer`              | `docs/`, root `*.md` files                                                                                                                                              |
| `@security-reviewer`        | Security fixes in any directory; review-only for non-security code                                                                                                      |
| `@accessibility-reviewer`   | Read-only review — never edits production code                                                                                                                          |
| `@architect`                | `docs/architecture/`, ADRs; read-only for code                                                                                                                          |
| `@compliance-specialist`    | `docs/compliance/` — regulatory obligation matrix, jurisdictional data-residency, retention; advisory, review-only on code                                              |
| `@finance-domain`           | `packages/core/` financial correctness (structural ownership stays with `@native-app-engineer`)                                                                         |
| `@product-manager`          | `docs/business/roadmap/`, `docs/business/sprints/`, GitHub Issues (read/create)                                                                                         |
| `@marketing-strategist`     | `docs/marketing/`, `docs/business/marketing/`, app store copy drafts                                                                                                    |
| `@business-analyst`         | `docs/business/pricing/`, `docs/business/revenue/`                                                                                                                      |
| `@ai-ops-engineer`          | `.github/agents/`, `.github/skills/`, `.github/instructions/`, `.github/prompts/`                                                                                       |
| `@data-engineer`            | `docs/analytics/`†, `config/analytics/`†, `docs/business/growth/` + product-telemetry files in `packages/core/.../analytics/` (co-reviewed with `@native-app-engineer`) |
| `@experimentation-engineer` | `config/feature-flags/`                                                                                                                                                 |
| `@performance-engineer`     | `performance.budget.json`, `docs/performance/`†                                                                                                                         |
| `@localization-engineer`    | `config/i18n/`†, `docs/i18n/`†                                                                                                                                          |
| `@release-manager`          | `.changeset/`, `CHANGELOG.md` (root + per-package), `docs/releases/`†                                                                                                   |
| `@qa-tester`                | Read-only across `apps/*`, `packages/`, `services/api/`; files GitHub Issues                                                                                            |

> † Net-new / planned home — created on first use (see the owning agent's File Ownership section). Cross-cutting code (analytics, i18n, performance) lives in platform-owned dirs; these agents own the schema/catalog/config + docs.

**Shared config** (`gradle/libs.versions.toml`, `settings.gradle.kts`, `package.json`, `turbo.json`) — one agent per run. Assign to `@native-app-engineer` (Gradle) or `@devops-engineer` (Node/CI).

### Escalation Path

1. **Re-read the relevant skill** — the answer may already be documented
2. **Consult `@architect`** — for cross-cutting or ambiguous design decisions
3. **Stop and document** — add `## Needs Decision: <question>` to the PR; do NOT guess on financial logic

### Adding a New Agent

1. Create `.github/agents/<name>.agent.md` with the full eight-key YAML frontmatter:
   ```yaml
   ---
   name: <agent-name>
   description: One-line summary shown in the agent picker.
   model: standard # or strong-reasoning
   when_to_use: 'A sentence telling the orchestrator when to route here.'
   primary_paths:
     - 'path/the/agent/owns/**'
   write_scope: full # or scoped-write | read-only
   risk_level: low # or medium | high
   tools:
     - read
     - edit
     - search
   ---
   ```
2. Write the Markdown body with the **eight standard sections**: Role, Capabilities, File Ownership, Workflow, Planning & Verification, Technical Context, Boundaries, and Human-Gated Operations (see [`agents.instructions.md`](../../.github/instructions/agents.instructions.md))
3. Update this document (`docs/ai/agents.md`) and [`agent-instructions.md`](agent-instructions.md) with the new agent, and add its ownership row above
4. Run `npm run ai:manifest:check` to confirm the roster/skill counts in the docs still match the filesystem
5. Test the agent by invoking it in Copilot Chat

## Best Practices

- **Invoke the right agent** — Use `@security-reviewer` for security reviews, not generic Copilot
- **Combine agents** — Ask `@architect` to design, then `@security-reviewer` to review
- **Trust but verify** — Agent output is a starting point; always review critically
- **Update agents** — As the project evolves, update agent instructions to reflect new patterns
- **Respect file ownership** — In fleet runs, each agent owns its directory; avoid cross-agent edits to the same file
- **Serialize schema work** — `@database-engineer` writes Supabase migrations/PowerSync rules; `@native-app-engineer` writes SQLDelight schemas/client models; coordinate as a pair, not independently
- **Never guess on money** — Financial logic decisions must be human-approved; agents should stop and document rather than assume

## Agent Workflow (MANDATORY)

Every agent MUST follow this pre-push sequence before every `git push`:

1. `npm run format && npx eslint . --fix` — auto-fix all issues
2. `npm run format:check && npx eslint . --max-warnings 0` — verify clean
3. `git add -A && git commit --amend --no-edit` — amend commit with fixes
4. `$env:HUSKY = "0" ; git push --no-verify origin <branch>` — push (bypass pre-push hook)
5. `gh pr create` with `Closes #N` — create PR immediately
6. `gh pr view <branch> --json number` — **verify the PR actually exists**; if not, re-run step 5

**Pushing and creating PRs is auto-approved and mandatory.** Stopping at a local commit without a PR is a workflow violation. Stopping after step 5 without the step-6 verification is the silent-failure mode that produces "ghost PR" workflow gaps (branch pushed, no PR open).

### Definition of Done — BOTH gates must clear

| Gate               | Verification                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------- |
| CI green           | `gh pr checks <N>` — no failing checks                                                    |
| No merge conflicts | `gh pr view <N> --json mergeable,mergeStateStatus` — `MERGEABLE` and not `DIRTY`/`BEHIND` |

**Merge conflicts carry the same P0 weight as red CI checks.** A green-CI PR sitting in `CONFLICTING` state is not done. See the **Merge Conflict Protocol** in `.github/instructions/workflow.instructions.md` for the auto-resolve cycle (rebase, lockfile / generated-file auto-resolve, escalate semantic conflicts).

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
- **23 agents** are defined in `.github/agents/`: 22 generated canonical definitions plus local `finance-domain`
