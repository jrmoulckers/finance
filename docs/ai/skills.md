# Agent Skills — Finance

Agent skills are reusable bundles of domain knowledge that AI agents can activate when working on relevant tasks. They live in `.github/skills/` and follow the open [Agent Skills specification](https://agentskills.io/specification).

## How Skills Work

1. Each skill is a directory under `.github/skills/` containing a `SKILL.md` file
2. The `SKILL.md` has YAML frontmatter (name, description) and a Markdown body with detailed knowledge
3. Copilot reads only the frontmatter for discovery — the full body loads only when the skill is relevant
4. Skills are activated automatically based on keyword matching in the description
5. Skills are compatible with GitHub Copilot, VS Code Copilot Chat, and other MCP-compatible agents

## Available Skills

### `edge-sync` — Edge Computing & Data Synchronization

**File:** `.github/skills/edge-sync/SKILL.md`

**Trigger keywords:** sync, offline, conflict resolution, CRDT, delta sync, replication, edge computing

**Knowledge areas:**
- Offline-first architecture patterns
- Conflict resolution strategies (LWW with vector clocks, CRDTs, operational transforms)
- Delta sync protocol design
- Sync queue management with retry and deduplication
- Platform-specific background sync APIs
- Testing strategies for sync scenarios

**When activated:** Whenever an agent works on data synchronization, offline functionality, or the sync engine in `packages/sync/`.

---

### `financial-modeling` — Financial Calculations & Domain Modeling

**File:** `.github/skills/financial-modeling/SKILL.md`

**Trigger keywords:** money, budget, transaction, currency, financial calculation, balance, accounting

**Knowledge areas:**
- Money representation (integer cents, no floating point)
- Currency handling (ISO 4217, exchange rates)
- Budgeting models (envelope/zero-based, 50/30/20)
- Transaction processing (income, expense, transfer, split)
- Recurring transaction handling
- Goal tracking and projections
- Net worth calculation and reporting
- Rounding rules (banker's rounding)
- Financial domain entity model

**When activated:** Whenever an agent works on business logic in `packages/core/`, `packages/models/`, or financial calculations anywhere in the codebase.

---

### `privacy-compliance` — Privacy Regulation & Data Protection

**File:** `.github/skills/privacy-compliance/SKILL.md`

**Trigger keywords:** GDPR, CCPA, privacy, data protection, consent, data deletion, encryption, PII, regulatory compliance

**Knowledge areas:**
- GDPR requirements (lawful basis, data minimization, rights)
- CCPA/CPRA requirements
- Data inventory and classification
- Consent management patterns
- Data export/portability implementation
- Data deletion and crypto-shredding
- Encryption requirements (at rest, in transit)
- Data minimization checklist
- Privacy by Design principles
- Privacy review triggers

**When activated:** Whenever an agent works on data handling, storage, transmission, or third-party integrations.

---

### `dev-onboarding` — Developer Environment Setup

**File:** `.github/skills/dev-onboarding/SKILL.md`

**Trigger keywords:** setup, install, onboarding, getting started, prerequisites, environment, new developer

**Knowledge areas:**
- Prerequisites checklist (Git, Node.js, VS Code, Copilot)
- First-time setup steps
- MCP server verification
- GitHub PAT configuration
- Common onboarding issues and fixes
- Platform-specific tool requirements

**When activated:** Whenever an agent helps with environment setup, onboarding, or troubleshooting developer tooling.

---

### `kmp-development` — Kotlin Multiplatform Development

**File:** `.github/skills/kmp-development/SKILL.md`

**Trigger keywords:** KMP, Kotlin, multiplatform, commonMain, expect actual, SQLDelight, Ktor, Gradle, shared code

**Knowledge areas:**
- KMP project structure and source-set hierarchy (commonMain, androidMain, iosMain, jvmMain, jsMain, wasmJsMain)
- Gradle configuration patterns (version catalogs, composite builds, convention plugins)
- Expect/actual declaration patterns for platform-specific APIs
- SQLDelight setup, `.sq` files, platform drivers, and migration strategy
- kotlinx libraries usage (serialization, datetime, coroutines)
- Swift Export and SKIE configuration for iOS
- Kotlin/JS and Kotlin/Wasm configuration for web
- Testing patterns (kotlin.test, Turbine for Flow testing)
- Financial-specific patterns (value classes for IDs, Long for cents)
- Common pitfalls (java.* in commonMain, dispatcher misuse, K/N memory model)

**When activated:** Whenever an agent works on KMP shared modules in `packages/`, Gradle build configuration, or cross-platform code patterns.

---

### `supabase-powersync` — Supabase & PowerSync Backend

**File:** `.github/skills/supabase-powersync/SKILL.md`

**Trigger keywords:** Supabase, PostgreSQL, RLS, Edge Functions, PowerSync, sync rules, migration, database schema

**Knowledge areas:**
- Supabase project setup and configuration
- PostgreSQL schema design for financial data
- Row-Level Security (RLS) policies for multi-tenant isolation
- Supabase Auth configuration (Passkeys, OAuth, JWT)
- Edge Functions development (Deno runtime, TypeScript)
- PowerSync sync rules and selective replication
- Database migration patterns (versioned, reversible)
- CRDT-based conflict resolution
- Data export/deletion for GDPR/CCPA compliance

**When activated:** Whenever an agent works on the backend in `services/supabase/`, sync engine configuration, database schema changes, or RLS policies.

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

## Future Skills (Planned)

As the project grows, additional skills may include:
- `platform-ios` — iOS/SwiftUI development patterns
- `platform-android` — Android/Kotlin development patterns
- `platform-web` — PWA/TypeScript development patterns
- `platform-windows` — Windows/WinUI development patterns
- `testing-strategy` — Testing patterns and best practices
- `ci-cd-pipeline` — CI/CD configuration and debugging
