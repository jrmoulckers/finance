---
name: security-review-methodology
description: >
  Security and privacy review methodology for the Finance app. Use for topics
  related to threat modeling, OWASP MASVS, security review, vulnerability
  assessment, auth, crypto, RLS, Edge Functions, financial data exposure,
  secure logging, or abuse prevention.
---

# Security Review Methodology Skill

## Purpose

This skill covers **how to perform high-signal security and privacy reviews** for Finance changes. It focuses on threat modeling, evidence collection, exploitability, and financial-data risk across apps, shared KMP packages, sync, and Supabase backend code.

## Out of Scope

- Legal/regulatory interpretation, data subject rights, and consent requirements → use `privacy-compliance`.
- Backend implementation details for RLS, migrations, and Edge Functions → use `supabase-powersync`.
- Client sync conflict behavior and offline replay semantics → use `edge-sync`.
- General code quality review without security impact → use the relevant engineering skill.

## Related Skills

| Skill                | Use For                                                    |
| -------------------- | ---------------------------------------------------------- |
| `privacy-compliance` | GDPR/CCPA obligations, erasure/export, consent, retention  |
| `supabase-powersync` | RLS, Edge Functions, migration safety, service-role usage  |
| `edge-sync`          | Offline mutation replay, conflict paths, encrypted sync    |
| `mcp-agent-tooling`  | Tool/server security, token scopes, and MCP trust boundary |

## Repo-Specific Review Surfaces

| Area              | Paths / Signals                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Web security      | `apps/web/src/lib/security/`, auth/session code, service worker, IndexedDB                                  |
| Shared security   | `packages/core/src/commonMain/kotlin/com/finance/core/security/`                                            |
| Sync crypto       | `packages/sync/src/commonMain/**/sync/crypto/`, auth, mutation queue                                        |
| Backend functions | `services/api/supabase/functions/**`, especially `_shared/auth.ts`, `rate-limit.ts`, `logger.ts`, `cors.ts` |
| CI security       | `.github/workflows/ci-security.yml`, `config/detekt/detekt.yml`                                             |

## Review Workflow

1. **Define the asset**: financial records, auth/session material, household membership, export files, deletion flows, sync mutations, or device trust state.
2. **Map trust boundaries**: local device ↔ service worker/IndexedDB ↔ PowerSync ↔ Edge Function ↔ Supabase RLS.
3. **Check authorization first**: every read/write must bind to `auth.uid()`, `owner_id`, or household membership as appropriate.
4. **Check data minimization**: no plaintext logs of account balances, payees, notes, tokens, device fingerprints, or raw export data.
5. **Check crypto use**: no homegrown primitives; field/household keys stay behind sync crypto abstractions and platform secure storage.
6. **Check abuse controls**: rate limits, replay prevention, idempotency, webhook verification, and CORS allowlists.
7. **Classify findings**: report only high-confidence issues with severity, exploit path, affected data, and concrete fix.

## Finding Template

```markdown
## Finding

[One-sentence vulnerability statement]

## Impact

[Financial/privacy impact and affected users/records]

## Evidence

- `path/to/file:line` — vulnerable code path
- Preconditions required to exploit

## Fix

[Minimal secure change and tests to add]

## Confidence / Severity

[Low/Medium/High/Critical] — [why exploitable or why limited]
```

## Red Flags

- Edge Function uses service role without an explicit user/household authorization check.
- RLS policy omits `deleted_at IS NULL`, `household_id`, or `owner_id` constraints.
- Logs include request bodies, transaction details, balances, tokens, or export payloads.
- Client stores tokens or financial secrets outside platform secure storage / approved encrypted layers.
- Offline mutation replay can duplicate transfers, bypass validation, or resurrect soft-deleted records.

## Checklist

Apply [`CHECKLIST.md`](./CHECKLIST.md) as the sign-off gate for every security review.
