# Agent Skills — Finance

Agent skills are reusable bundles of domain knowledge that AI agents can activate when working on relevant tasks. They live in `.github/skills/` and follow the open [Agent Skills specification](https://agentskills.io/specification).

## How Skills Work

1. Each skill is a directory under `.github/skills/` containing a `SKILL.md` file
2. The `SKILL.md` has YAML frontmatter (name, description) and a Markdown body with detailed knowledge
3. Copilot reads only the frontmatter for discovery — the full body loads only when the skill is relevant
4. Skills are activated automatically based on keyword matching in the description
5. Skills are compatible with GitHub Copilot, VS Code Copilot Chat, and other MCP-compatible agents

## Available Skills

> **Source of truth:** the directories under [`.github/skills/`](../../.github/skills/). As of 2026-06 there are **20** skills, each detailed below in alphabetical order. The generated `ai-manifest` check keeps these counts in sync (`npm run ai:manifest:check`) — see the [CHANGELOG](CHANGELOG.md).

### `accessibility-testing` — Accessibility Testing (WCAG 2.2 AA)

**File:** `.github/skills/accessibility-testing/SKILL.md`

**Trigger keywords:** WCAG 2.2 AA, a11y testing, screen readers, keyboard navigation, focus management, contrast, reduced motion, TalkBack, VoiceOver, Narrator, inclusive QA

**Knowledge areas:**

- Repo-specific accessibility surfaces across the four platforms
- Test methodology (keyboard, screen reader, contrast, reduced motion)
- Per-platform a11y checklist (TalkBack, VoiceOver, Narrator)
- Acceptance criteria for accessibility issues

**Supporting files:** `.github/skills/accessibility-testing/CHECKLIST.md` — per-platform sign-off checklist

**When activated:** Whenever an agent validates accessibility, screen-reader support, keyboard navigation, or WCAG compliance.

---

### `design-tokens` — Design Token System

**File:** `.github/skills/design-tokens/SKILL.md`

**Trigger keywords:** DTCG tokens, Style Dictionary, color tokens, semantic tokens, component tokens, chart palettes, typography, spacing, motion, contrast, theming, generated token outputs

**Knowledge areas:**

- DTCG token model (core, semantic, and component layers)
- Style Dictionary configuration and generated outputs
- Repo-specific token paths
- Token authoring rules
- Finance-specific checks (chart palettes, contrast)

**When activated:** Whenever an agent works on design tokens, theming, color systems, or Style Dictionary outputs.

---

### `dev-onboarding` — Developer Environment Setup

**File:** `.github/skills/dev-onboarding/SKILL.md`

**Trigger keywords:** setup, install, onboarding, getting started, prerequisites, environment, new developer

**Knowledge areas:**

- Prerequisites checklist (Git, Node.js, VS Code, Copilot)
- First-time setup steps and useful scripts
- Husky hooks, lint-staged, pre-push guardrails
- Detekt (Kotlin lint), Prettier, ESLint configuration
- Tools directory scripts (worktree cleanup, changelog generation, pre-release checks)
- MCP server verification
- GitHub PAT configuration
- Common onboarding issues and fixes

**When activated:** Whenever an agent helps with environment setup, onboarding, or troubleshooting developer tooling.

---

### `edge-sync` — Edge Computing & Data Synchronization

**File:** `.github/skills/edge-sync/SKILL.md`

**Trigger keywords:** sync, offline, conflict resolution, delta sync, replication, edge computing

**Knowledge areas:**

- Offline-first architecture patterns
- Conflict resolution strategies (LWW, Merge, ClientWins, ServerWins)
- Delta sync protocol design with sequence tracking and checksum verification
- Sync queue management with retry, deduplication, and dead-lettering
- Platform-specific sync integration (Android SyncModule, Web IndexedDB mutation queue)
- Envelope encryption, field-level encryption, and crypto-shredding
- Auth integration (PKCE, token management)
- Testing strategies for sync scenarios (35+ test files)

**When activated:** Whenever an agent works on data synchronization, offline functionality, or the sync engine in `packages/sync/`.

---

### `financial-modeling` — Financial Calculations & Domain Modeling

**File:** `.github/skills/financial-modeling/SKILL.md`

**Trigger keywords:** money, budget, transaction, currency, financial calculation, balance, accounting

**Knowledge areas:**

- Money representation (integer cents, no floating point)
- Currency handling (ISO 4217, exchange rates)
- Budgeting models (envelope/zero-based, 50/30/20) with rollover logic
- Transaction processing (income, expense, transfer, split)
- Recurring transaction handling
- Goal tracking with status lifecycle (active, completed, archived) and account linkage
- Net worth calculation and reporting
- Data export (JSON, CSV) with SHA-256 checksums and anonymized user IDs
- AI-powered engines: smart categorization, balance prediction, subscription detection, savings engine, budget recommendations
- Rounding rules (banker's rounding)

**When activated:** Whenever an agent works on business logic in `packages/core/`, `packages/models/`, or financial calculations anywhere in the codebase.

---

### `fleet-orchestration` — Multi-Agent Sprint Execution

**File:** `.github/skills/fleet-orchestration/SKILL.md`

**Trigger keywords:** fleet, parallel agents, sprint dispatch, worktree coordination, multi-agent

**Knowledge areas:**

- Agent type registry (25 agents: engineering, review, ops/meta, business)
- Label-to-agent mapping for issue routing
- Sprint planning algorithm (query → categorize → deps → group → track)
- Fleet dispatch protocol with background task parallelism
- Worktree naming and lifecycle management
- Pre-push sequence (mandatory for all agents) with `$env:HUSKY = "0"` and `--max-warnings 0`
- Lessons learned from 3 fleet waves (140+ PRs)
- CI self-healing protocol
- File ownership and shared config coordination rules

**When activated:** Whenever deploying multiple agents across worktrees, planning sprints, or coordinating parallel PR workflows.

---

### `go-to-market` — Marketing & Launch Strategy

**File:** `.github/skills/go-to-market/SKILL.md`

**Trigger keywords:** app store, ASO, launch, marketing, user acquisition, growth, content strategy

**Knowledge areas:**

- App Store Optimization (title, subtitle, keywords, screenshots per platform)
- Launch communication plan (pre-launch, launch day, post-launch checklists)
- Content strategy with blog post calendar
- Privacy-first messaging pillars
- User acquisition channels (organic and paid)
- Competitive positioning vs YNAB, Monarch, Copilot
- Growth metrics (MAU, activation, retention cohorts, revenue)
- Marketing issue templates

**When activated:** Whenever an agent works on marketing content, app store listings, launch planning, or growth strategy.

---

### `i18n-localization` — Internationalization & Localization

**File:** `.github/skills/i18n-localization/SKILL.md`

**Trigger keywords:** i18n, localization, translations, locale packs, string keys, currency/date/number formatting, pluralization, text expansion, right-to-left readiness, financial terminology

**Knowledge areas:**

- Repo-specific i18n paths and locale catalogs
- String key naming rules
- Financial formatting rules (currency, date, number, pluralization)
- Localization review checklist

**Supporting files:** `.github/skills/i18n-localization/CHECKLIST.md` — localization review checklist

**When activated:** Whenever an agent works on translations, locale formatting, string keys, or RTL readiness.

---

### `issue-management` — Issue Quality & Cross-Platform Scoping

**File:** `.github/skills/issue-management/SKILL.md`

**Trigger keywords:** issue filing, bug reports, platform scoping, cross-platform duplicates, label taxonomy, issue quality

**Knowledge areas:**

- Canonical label taxonomy and platform labels
- Cross-platform scoping decision tree (when to create platform duplicates)
- Mandatory pre-filing validation gate
- Issue body quality standards (bug and enhancement templates)
- Duplicate identification and linking
- PowerShell-safe / Node-based batch issue creation
- Mandatory post-session audit

**When activated:** Whenever an agent files issues, scopes work across platforms, or manages duplicates.

---

### `kmp-development` — Kotlin Multiplatform Development

**File:** `.github/skills/kmp-development/SKILL.md`

**Trigger keywords:** KMP, Kotlin, multiplatform, commonMain, expect actual, SQLDelight, Ktor, Gradle, shared code

**Knowledge areas:**

- KMP project structure and source-set hierarchy (commonMain, androidMain, iosMain, jvmMain, jsMain)
- Gradle configuration patterns (version catalogs, composite builds, convention plugins)
- Expect/actual declaration patterns for platform-specific APIs
- SQLDelight setup, `.sq` files, platform drivers, and migration strategy
- kotlinx libraries usage (serialization, datetime, coroutines)
- AI engines: categorization, prediction, subscription detection, savings, budget recommendations
- Feature flags (`FeatureFlagEngine`), environment configs, i18n framework
- Analytics tracking with privacy-respecting event batching
- Security hardening: RASP (`RuntimeIntegrityChecker`), device attestation, biometric crypto binding
- Monitoring interfaces (`CrashReporter`, `MetricsCollector`, `SyncHealthMonitor`)
- Data export module (JSON/CSV with checksums)
- iOS interop status (Swift Export planned, not current)
- JavaScript target notes (TypeScript React web app, Kotlin/JS for library code)
- Testing patterns (kotlin.test, Turbine for Flow testing)
- Common pitfalls (java.\* in commonMain, dispatcher misuse, K/N memory model)

**When activated:** Whenever an agent works on KMP shared modules in `packages/`, Gradle build configuration, or cross-platform code patterns.

---

### `mcp-agent-tooling` — MCP & Agent Tooling

**File:** `.github/skills/mcp-agent-tooling/SKILL.md`

**Trigger keywords:** Model Context Protocol, MCP servers, .vscode/mcp.json, Copilot tools, agent scripts, tool permissions, token scopes, workspace filesystem access, safe agent automation

**Knowledge areas:**

- Current MCP servers and their configuration (`.vscode/mcp.json`)
- Repo-specific tooling paths
- Safe tooling rules (tool permissions, token scopes, filesystem boundary)
- Review checklist for MCP changes

**When activated:** Whenever an agent works on MCP servers, agent tool configuration, or tool permissions.

---

### `monetization` — Pricing & Subscription Management

**File:** `.github/skills/monetization/SKILL.md`

**Trigger keywords:** freemium, IAP, pricing, subscription, revenue, tier, premium

**Knowledge areas:**

- Freemium tier design (free vs premium feature boundaries)
- Platform-specific IAP integration (StoreKit 2, Play Billing, Stripe, Microsoft Store)
- Cross-platform entitlement sync via Supabase
- Competitive pricing analysis
- Revenue analytics (MRR, churn, LTV, conversion funnel)
- Privacy-as-premium brand positioning
- Feature gating architecture (KMP shared code enforcement)
- Offline grace period for subscriptions

**When activated:** Whenever an agent works on monetization, pricing strategy, or subscription management.

---

### `performance-budgets` — Performance Budgets

**File:** `.github/skills/performance-budgets/SKILL.md`

**Trigger keywords:** Lighthouse, Core Web Vitals, LCP, INP, CLS, TBT, bundle budgets, lazy chunks, route budgets, startup performance, service workers, performance regression triage

**Knowledge areas:**

- Web PWA route and bundle budgets (`performance.budget.json`, Lighthouse CI)
- Current Web budget targets (LCP, INP, CLS, TBT, JS gzip ceilings)
- Repo-specific budget tools and checkers
- Regression triage workflow
- Acceptance criteria for performance issues

**Supporting files:** `.github/skills/performance-budgets/WEB_CHECKLIST.md` — web performance-budget sign-off checklist

**When activated:** Whenever an agent works on performance budgets, Core Web Vitals, bundle size, or regression triage.

---

### `privacy-compliance` — Privacy Regulation & Data Protection

**File:** `.github/skills/privacy-compliance/SKILL.md`

**Trigger keywords:** GDPR, CCPA, privacy, data protection, consent, data deletion, encryption, PII, regulatory compliance

**Knowledge areas:**

- GDPR requirements (lawful basis, data minimization, rights)
- CCPA/CPRA requirements
- Security hardening: RASP, device attestation, biometric crypto binding, session binding
- Data export/portability (Edge Function + KMP client-side export)
- Data deletion and crypto-shredding
- Encryption requirements (at rest, in transit)
- Privacy audit baseline and security audit docs
- Privacy review triggers

**When activated:** Whenever an agent works on data handling, storage, transmission, or third-party integrations.

---

### `project-management` — Issue Lifecycle & Release Management

**File:** `.github/skills/project-management/SKILL.md`

**Trigger keywords:** issue lifecycle, roadmap, milestone, backlog, release, sprint, velocity

**Knowledge areas:**

- Issue lifecycle (Triage → Shaping → Ready → In Progress → In Review → Done)
- Label taxonomy (priority, type, platform, effort)
- Roadmap and milestone management
- Sprint velocity tracking with effort-weighted points
- Backlog grooming and stale issue detection
- Release management (Changesets, semver, platform-specific release workflows)
- Platform-specific CI pipelines (android-ci, ios-ci, web-ci, windows-ci) and release workflows
- Cross-team coordination and fleet integration
- Sprint retrospective format

**When activated:** Whenever an agent works on project planning, issue management, or release coordination.

---

### `prompt-engineering` — Prompt Engineering

**File:** `.github/skills/prompt-engineering/SKILL.md`

**Trigger keywords:** prompt design, reusable prompts, Copilot instructions, agent handoffs, context packaging, task decomposition prompts, review prompts, reducing ambiguity

**Knowledge areas:**

- Repo-specific prompt assets (`.github/prompts/`)
- Prompt shape for Finance work (goal, context, owned files, tasks, validation, completion)
- Prompt quality rules
- Anti-patterns to avoid

**When activated:** Whenever an agent designs prompts, authors Copilot instructions, or packages context for agent handoffs.

---

### `security-review-methodology` — Security & Privacy Review

**File:** `.github/skills/security-review-methodology/SKILL.md`

**Trigger keywords:** threat modeling, OWASP MASVS, security review, vulnerability assessment, auth, crypto, RLS, Edge Functions, financial data exposure, secure logging, abuse prevention

**Knowledge areas:**

- Repo-specific security review surfaces (web, shared, sync crypto, backend functions, CI)
- Review workflow (asset definition, trust boundaries, authZ, data minimization, crypto, abuse controls)
- Finding template and severity/confidence classification
- Red flags (service-role misuse, RLS gaps, sensitive logging, offline replay)

**Supporting files:** `.github/skills/security-review-methodology/CHECKLIST.md` — security review sign-off checklist

**When activated:** Whenever an agent performs a security or privacy review, threat models a change, or assesses financial-data risk.

---

### `sprint-planning` — Sprint Planning & Backlog Management

**File:** `.github/skills/sprint-planning/SKILL.md`

**Trigger keywords:** sprint, planning, backlog, prioritize, decompose, workload, agent dispatch

**Knowledge areas:**

- Issue categorization by agent type (25 agent types)
- Sprint sizing (4–6 implementation + 1–2 business + 1 review)
- Dependency detection and schema change serialization
- Priority framework (P0–P3) with assignment rules
- Sprint SQL template for tracking with dependencies
- Business sprint integration (product management, marketing, business analysis)
- Sprint lifecycle checklist
- Historical context: 3 fleet waves, 140+ PRs, 17 sprints per agent type

**When activated:** Whenever an agent plans sprints, prioritizes issues, decomposes work, or balances workloads across agent types.

---

### `supabase-powersync` — Supabase & PowerSync Backend

**File:** `.github/skills/supabase-powersync/SKILL.md`

**Trigger keywords:** Supabase, PostgreSQL, RLS, Edge Functions, PowerSync, sync rules, migration, database schema

**Knowledge areas:**

- Supabase project setup and local development
- PostgreSQL schema design (BIGINT money, UUID PKs, soft deletes, owner_id, sync columns)
- Row-Level Security (RLS) household isolation pattern
- Supabase Auth (Passkeys/WebAuthn, OAuth)
- Edge Functions (17 functions including data-export, launch-readiness, device attestation, recurring processing)
- PowerSync sync rules and selective replication
- Database migrations (23 up-migrations with matching down reversals)
- Rate limiting, notification infrastructure, webhook infrastructure
- CRDT-based conflict resolution (LWW, Merge, ClientWins, ServerWins)
- Data export with audit logging
- Crypto-shredding implementation pattern
- Performance optimization (partial indexes, materialized views)

**When activated:** Whenever an agent works on the backend in `services/api/`, sync engine configuration, database schema changes, or RLS policies.

---

### `ux-testing` — UX & QA Testing

**File:** `.github/skills/ux-testing/SKILL.md`

**Trigger keywords:** alpha testing, beta testing, QA, bug discovery, testing scenarios, manual testing, user experience validation

**Knowledge areas:**

- Testing session structure (setup, platform maturity, session flow)
- Mandatory pre-filing gate (scope, code refs, duplicates, labels)
- Bug investigation methodology and parallel dispatch
- Ordered testing scenarios (auth, navigation, transactions, import, budgets/goals, charts, settings)
- Severity classification and bug report template
- PowerShell-safe batch issue filing and post-session audit

**When activated:** Whenever an agent runs a live testing session, discovers bugs, or validates user experience.

---

## Skill ↔ Agent Mapping

Each agent loads a focused set of skills for domain depth. The table below mirrors the **Related skills** line in every [`.github/agents/*.agent.md`](../../.github/agents/) file (the source of truth). Skills not listed for an agent still activate automatically when their trigger keywords match — this mapping captures the _primary_ skills each role should reach for.

| Agent                      | Related skills                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `accessibility-reviewer`   | `accessibility-testing`, `ux-testing`, `design-tokens`                                                                           |
| `ai-ops-engineer`          | `prompt-engineering`, `mcp-agent-tooling`, `issue-management`                                                                    |
| `android-engineer`         | `kmp-development`, `financial-modeling`, `accessibility-testing`, `design-tokens`                                                |
| `architect`                | `kmp-development`, `edge-sync`, `supabase-powersync`, `security-review-methodology`                                              |
| `backend-engineer`         | `supabase-powersync`, `edge-sync`, `security-review-methodology`, `privacy-compliance`                                           |
| `business-analyst`         | `monetization`, `go-to-market`, `project-management`                                                                             |
| `compliance-specialist`    | `privacy-compliance`, `security-review-methodology`, `financial-modeling`                                                        |
| `data-engineer`            | `privacy-compliance`, `financial-modeling`, `supabase-powersync`                                                                 |
| `design-engineer`          | `design-tokens`, `accessibility-testing`, `i18n-localization`                                                                    |
| `devops-engineer`          | `fleet-orchestration`, `performance-budgets`, `mcp-agent-tooling`, `dev-onboarding`                                              |
| `docs-writer`              | `dev-onboarding`, `project-management`, `prompt-engineering`                                                                     |
| `experimentation-engineer` | `edge-sync`, `privacy-compliance`, `financial-modeling`                                                                          |
| `finance-domain`           | `financial-modeling`, `edge-sync`, `privacy-compliance`                                                                          |
| `ios-engineer`             | `kmp-development`, `financial-modeling`, `accessibility-testing`, `design-tokens`                                                |
| `kmp-engineer`             | `kmp-development`, `edge-sync`, `financial-modeling`, `supabase-powersync`                                                       |
| `localization-engineer`    | `i18n-localization`, `financial-modeling`, `design-tokens`                                                                       |
| `marketing-strategist`     | `go-to-market`, `monetization`, `i18n-localization`                                                                              |
| `performance-engineer`     | `performance-budgets`, `kmp-development`, `edge-sync`                                                                            |
| `product-manager`          | `project-management`, `sprint-planning`, `issue-management`, `fleet-orchestration`                                               |
| `pwa-bug-basher`           | `ux-testing`, `accessibility-testing`, `issue-management`, `design-tokens`, `performance-budgets`, `security-review-methodology` |
| `qa-tester`                | `ux-testing`, `issue-management`, `accessibility-testing`                                                                        |
| `release-manager`          | `project-management`, `sprint-planning`, `dev-onboarding`                                                                        |
| `security-reviewer`        | `security-review-methodology`, `privacy-compliance`, `supabase-powersync`, `edge-sync`                                           |
| `web-engineer`             | `performance-budgets`, `accessibility-testing`, `financial-modeling`, `edge-sync`                                                |
| `windows-engineer`         | `kmp-development`, `financial-modeling`, `accessibility-testing`, `design-tokens`                                                |

> This table mirrors the roster in [`agents.md`](agents.md) (**25 agents**). When you add or retire an agent, update both its `*.agent.md` **Related skills** line and this table so the two never drift.

---

## Adding a New Skill

1. Create a directory: `.github/skills/<skill-name>/`
2. Create `SKILL.md` with YAML frontmatter (the `name` must match the directory):
   ```yaml
   ---
   name: skill-name
   description: >
     One-line summary, then "Use for topics related to <comma-separated
     trigger keywords>." so the skill activates on the right work.
   ---
   ```
3. Start the body with `# <Skill Name> Skill`, then `## Purpose` and `## Out of Scope` (route adjacent concerns to related skills) before detailed guidance — see `.github/instructions/skills.instructions.md`
4. Add domain knowledge, decision trees, checklists, and examples; prefer crisp tables over broad prose
5. Optionally add supporting files (checklists, scripts, templates) in the skill directory and surface them in the entry above
6. Update this document (`docs/ai/skills.md`) with the new skill's details, in alphabetical order

## Skill Naming Convention

- Lowercase, hyphen-delimited (e.g., `edge-sync`, `financial-modeling`)
- Maximum 64 characters
- Must match the directory name
- No leading/trailing hyphens or consecutive hyphens
