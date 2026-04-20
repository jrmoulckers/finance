# Agent Skills — Finance

Agent skills are reusable bundles of domain knowledge that AI agents can activate when working on relevant tasks. They live in `.github/skills/` and follow the open [Agent Skills specification](https://agentskills.io/specification).

## How Skills Work

1. Each skill is a directory under `.github/skills/` containing a `SKILL.md` file
2. The `SKILL.md` has YAML frontmatter (name, description) and a Markdown body with detailed knowledge
3. Copilot reads only the frontmatter for discovery — the full body loads only when the skill is relevant
4. Skills are activated automatically based on keyword matching in the description
5. Skills are compatible with GitHub Copilot, VS Code Copilot Chat, and other MCP-compatible agents

## Available Skills

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

- Agent type registry (15 agents: engineering, review, business)
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

### `sprint-planning` — Sprint Planning & Backlog Management

**File:** `.github/skills/sprint-planning/SKILL.md`

**Trigger keywords:** sprint, planning, backlog, prioritize, decompose, workload, agent dispatch

**Knowledge areas:**

- Issue categorization by agent type (15 agent types)
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

## Adding a New Skill

1. Create a directory: `.github/skills/<skill-name>/`
2. Create `SKILL.md` with YAML frontmatter:
   ```yaml
   ---
   name: skill-name
   description: >
     Clear description with trigger keywords for when the skill should activate.
   ---
   ```
3. Write comprehensive Markdown body with domain knowledge, patterns, examples, and guidelines
4. Optionally add supporting files (scripts, templates, reference docs) in the skill directory
5. Update this document (`docs/ai/skills.md`) with the new skill's details

## Skill Naming Convention

- Lowercase, hyphen-delimited (e.g., `edge-sync`, `financial-modeling`)
- Maximum 64 characters
- Must match the directory name
- No leading/trailing hyphens or consecutive hyphens
