---
applyTo: 'config/**'
---

# Instructions for Cross-Cutting Configuration

You are working in `config/`, which holds versioned, cross-cutting configuration that is consumed by multiple apps, packages, or CI. Ownership is **per-subdirectory** — confirm the owner below before editing, and never claim a sibling's path.

> Design tokens are **not** here. Token sources live in `packages/design-tokens/` and are governed by `tokens.instructions.md`.

## Subdirectory Ownership

| Path                    | Owner                       | Purpose                                                                                 |
| ----------------------- | --------------------------- | --------------------------------------------------------------------------------------- |
| `config/feature-flags/` | `@experimentation-engineer` | `flags.json` flag definitions + flag-schema `README.md`; rollout lifecycle              |
| `config/detekt/`        | `@devops-engineer`          | `detekt.yml` — Kotlin static-analysis/lint rules run in CI                              |
| `config/i18n/`          | `@localization-engineer`    | Locale catalogs and financial-terminology config                                        |
| `config/analytics/`     | `@data-engineer`            | Privacy-preserving event schemas / telemetry taxonomy (**net-new — may not exist yet**) |

## General Rules

- Treat every file here as a contract consumed elsewhere — a change can affect builds, CI gates, or runtime behavior across all four platforms. Identify and check downstream consumers before editing.
- Keep configuration declarative and machine-validated. Prefer JSON/YAML with a documented schema (a `README.md` in the subdirectory) over implicit conventions.
- Never commit secrets, tokens, or environment-specific credentials. Reference environment variable names; keep real values in platform secret stores.
- Validate structure before committing (valid JSON/YAML, required keys present). Tools and CI must fail loudly on malformed config — never let a bad file degrade silently.
- Keep keys/identifiers stable. Treat a rename or removal as a breaking change for consumers and document the migration path.

## Feature Flags (`config/feature-flags/`)

- `flags.json` is the source of truth for flag **content and lifecycle**. Each flag carries `description`, `enabled`, `owner` (the feature team building behind it), `platforms`, `rollout_percentage`, `expires`, and an explicit rollback/kill-switch plan.
- Flags are also synced to clients at runtime via the PostgreSQL `feature_flags` table + PowerSync (see `services.instructions.md`); this directory governs the **definitions**, not the sync transport.
- Experiments are privacy-first: use stable random identifiers and deterministic bucketing, never PII or raw financial data. Set an `expires` date and remove stale flags to control flag debt.
- Any flag that changes money calculations, allocation, rounding, recurrence, or financial recommendations requires `@finance-domain` review before rollout increases.

## Lint & Analytics Config

- `config/detekt/detekt.yml` defines Kotlin code-quality rules enforced in CI — keep it aligned with the conventions in `build-logic/` and `packages.instructions.md`.
- `config/analytics/` event schemas must follow data-minimization: collect only what a defined metric needs, document each event, and never capture account numbers, balances, or transaction detail.
- Product telemetry is distinct from financial reporting. Telemetry schemas may describe user actions and operational outcomes with bounded cardinality; financial reports remain domain data and must not be repurposed as analytics events.
- `config/i18n/` uses stable keys, CLDR formatting rules, ISO 4217 currency metadata, plural/placeholder validation, and RTL-safe catalogs. Platform integration routes to the native or web owner.
