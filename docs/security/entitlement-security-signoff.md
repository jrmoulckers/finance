# Entitlement security sign-off

| Field                        | Value                                                       |
| ---------------------------- | ----------------------------------------------------------- |
| Status                       | Pass for Stage 8 Phase 1                                    |
| Review date                  | 2026-09-09                                                  |
| Reviewed integrated baseline | `edb0edbe8817f2921836054ca5a9bd80118a7836`                  |
| Tracking issue               | [#4406](https://github.com/jrmoulckers/finance/issues/4406) |

This is the independent security review of the server-authoritative entitlement program merged
through Stage 7. The review reconciled the canonical changes in #4407, #4408, #4409, #4410, #4411,
#4412, #4416, #4417, #4418, #4420, and #4423. Two High findings were fixed in this evidence change;
no Critical, High, Medium, or Low security finding remains open.

This document covers security only. It does not provide the privacy or reliability sign-offs
required by #4406 and does not authorize provider configuration, secret access, deployment, or
production enablement.

## Threat model

### Assets

- RevenueCat and Stripe webhook credentials, provider identities, purchase references, and receipts.
- The immutable billing evidence ledger, grants, entitlement projection, and household membership.
- Bank-connection capacity, provider credentials, and the durable revocation queue.
- Authenticated identities and minimized entitlement responses cached on client devices.

### Trust boundaries and controls

| Boundary                                                                 | Primary threats                                                                       | Verified controls                                                                                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RevenueCat or Stripe to public webhook                                   | Forgery, replay, stale evidence, payload exhaustion, wrong account or environment     | Exact-body HMAC, rotating secrets, freshness window, provider account/environment binding, bounded bodies, fail-closed rate limits                          |
| Authenticated client to confirmation, checkout, entitlement, or bank API | Subject substitution, arbitrary product selection, cross-household access, cap bypass | Server-derived `auth.uid()`, active membership checks, catalog allowlist, authoritative projection, reservation and direct-writer enforcement               |
| Edge Function service role to PostgreSQL                                 | Privilege expansion, mutable evidence, tenant leakage                                 | Narrow service-only routines, immutable ledger, RLS, revoked direct grants, owner and household predicates                                                  |
| Ledger and provider evidence to projection                               | Duplicate or reordered grants, terminal-state resurrection, unknown-event grants      | Provider/environment/event uniqueness, deterministic ordering, purchase binding, deny-by-default normalization, irreversible refund and chargeback states   |
| Server projection to client cache                                        | Stale authorization or identifier disclosure                                          | Minimized capability response, principal and scope binding, `no-store`, refresh deadlines, display-only cache, authoritative server recheck                 |
| Bank API to provider and revocation worker                               | Concurrent cap bypass, orphaned credentials, lost or duplicate revocation             | Advisory locks, expiring reservations, direct-write trigger, AES-256-GCM envelope, enqueue-before-disable, leases, bounded retry, idempotent terminal purge |

## Blocking case disposition

| Case                       | Result         | Security evidence                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webhook-revenuecat-auth`  | Pass           | `revenuecat-webhook` authenticates configured authorization and rotating HMAC secrets over exact raw bytes, enforces freshness, limits bodies to 256 KiB, and rate-limits fail closed. Confirmation binds provider lookup to `auth.uid()` and active household membership.                                                                            |
| `webhook-stripe-signature` | Pass after fix | `stripe-webhook` verifies rotating HMAC secrets over the exact UTF-8 body before parsing, enforces a five-minute freshness window, and checks account and live/test mode. The fix adds a streaming 256 KiB body ceiling and fail-closed 120-request/minute source budget before signature work.                                                       |
| `event-idempotency-order`  | Pass           | Ledger uniqueness is provider/environment/event scoped; duplicate evidence cannot overwrite the first record. Purchase binding and the effective-time, provider-order, lifecycle-precedence, event-ID ordering key make replay and reordering deterministic. Unknown provider events normalize to no grant.                                           |
| `terminal-nonresurrection` | Pass           | Refund and chargeback are irreversible for a purchase. Expiry can recover only from trusted renewal/reactivation evidence with a strictly newer provider order; stale, duplicate, and future terminal evidence tests cover the transition boundary.                                                                                                   |
| `tenant-isolation`         | Pass           | Billing tables have RLS enabled and no authenticated direct policies. Public, anonymous, and authenticated access to service mutators is revoked. `get_my_entitlements` binds to `auth.uid()` and active household membership, and cross-user/cross-household denials are integration-tested.                                                         |
| `cache-expiry`             | Pass           | APIs return only capability, scope, source, expiry, refresh, and evidence-version data with `Cache-Control: no-store`. Client caches are principal/scope bound, revalidate at their refresh boundary, and are display-only; server actions never trust them. Billing tables and provider identifiers are excluded from PowerSync.                     |
| `bank-cap-concurrency`     | Pass after fix | Expired projections fail closed, reservations are serialized with advisory locks, capacity is claimed before provider exchange, and the direct-writer trigger enforces the same live-plus-reserved cap. The final-slot race has exactly one winner. The fix removes connection identifiers and untrusted database/provider error text from bank logs. |
| `revocation-durability`    | Pass           | Provider credentials use AES-256-GCM with a fresh 96-bit IV, remain service-only, and are queued durably before local disable/deletion. Lease recovery, bounded retries, idempotent completion, terminal credential purge, and concurrent finalization/revocation are covered. Worker output contains only safe codes and aggregate counts.           |

## Findings

| ID            | Severity | Confidence | Exploit path and impact                                                                                                                                                                                                                                                                          | Resolution                                                                                                                                                                                                              |
| ------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEC-ENT-001` | High     | High       | An unauthenticated caller could send oversized or bursty requests with a syntactically valid Stripe signature header. The public webhook buffered the entire body and performed HMAC work without an application request budget, enabling resource exhaustion and delaying entitlement evidence. | Resolved by bounded streaming reads, a 256 KiB ceiling, and a fail-closed per-source request budget before signature processing. Denial-path tests prove neither oversized nor rate-limited requests reach the service. |
| `SEC-ENT-002` | High     | High       | Bank failure and recovery paths placed internal connection identifiers and raw database/provider error text into centralized logs. Anyone with log access, or a downstream log export, could receive financial-account linkage or provider-controlled content.                                   | Resolved by removing connection identifiers and raw exception text, replacing them with fixed operational codes, provider enums, HTTP status, booleans, and aggregate counts.                                           |

### Mandatory severity disposition

| Severity | Found | Resolved | Open | Gate |
| -------- | ----: | -------: | ---: | ---- |
| Critical |     0 |        0 |    0 | Pass |
| High     |     2 |        2 |    0 | Pass |
| Medium   |     0 |        0 |    0 | Pass |
| Low      |     0 |        0 |    0 | Pass |

No lower-severity security finding requires routing or independent disposition.

## Evidence

### Local synthetic verification

| Command                                                                                                                 | Result                      |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Targeted Deno entitlement suite covering rate limits, RevenueCat, Stripe, projection, bank cap, and revocation handlers | 250 passed, 0 failed        |
| `npm run test -w apps/web -- --run src/entitlements/entitlements.test.ts src/billing/productBilling.test.ts`            | 2 files and 16 tests passed |
| `.\gradlew.bat :packages:core:jvmTest :apps:windows:test --no-daemon`                                                   | Build successful            |
| `npm audit --audit-level=low`                                                                                           | 0 vulnerabilities           |

The Deno run used the repository function configuration with `--allow-env --allow-net --no-check`
and only synthetic identifiers and credentials. Local PostgreSQL concurrency execution was
unavailable because the local Docker engine was unavailable; the canonical Stage 7 integration job
below is the durable execution evidence for SQL and race suites.

### Durable GitHub evidence

Canonical Stage 7 PR [#4423](https://github.com/jrmoulckers/finance/pull/4423) merged as the reviewed
baseline and reported these terminal results:

| Check                                                                                                               | Result  |
| ------------------------------------------------------------------------------------------------------------------- | ------- |
| [Entitlement Gateway Integration](https://github.com/jrmoulckers/finance/actions/runs/34313328974/job/102344327954) | Success |
| [Web unit tests, shard 1](https://github.com/jrmoulckers/finance/actions/runs/34313328843/job/102344576828)         | Success |
| [Web unit tests, shard 2](https://github.com/jrmoulckers/finance/actions/runs/34313328843/job/102344576805)         | Success |
| [Web unit tests, shard 3](https://github.com/jrmoulckers/finance/actions/runs/34313328843/job/102344576803)         | Success |
| [Web unit tests, shard 4](https://github.com/jrmoulckers/finance/actions/runs/34313328843/job/102344576812)         | Success |
| [Observability Guardrails](https://github.com/jrmoulckers/finance/actions/runs/34313328974/job/102344328231)        | Success |
| [npm Audit](https://github.com/jrmoulckers/finance/actions/runs/34313328539/job/102344303853)                       | Success |
| [CodeQL Java/Kotlin](https://github.com/jrmoulckers/finance/actions/runs/34313328539/job/102344303864)              | Success |
| [CodeQL JavaScript/TypeScript](https://github.com/jrmoulckers/finance/actions/runs/34313328539/job/102344303612)    | Success |
| [Required Checks Gatekeeper](https://github.com/jrmoulckers/finance/actions/runs/34313328539/job/102344982581)      | Success |

The evidence change itself must also complete terminal CI and remain mergeable before this sign-off
is presented for coordinator clearance.

## Residual production gates

These are unexercised deployment assumptions, not accepted security findings:

| Gate                                       | Accountable owner                  | Review deadline                | Required evidence                                                                                                                                                                          |
| ------------------------------------------ | ---------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Provider configuration and secret rotation | Backend owner with security review | Before any provider enablement | Synthetic signed staging requests prove the configured RevenueCat and Stripe secret sets, account ID, and environment fail closed. No provider secret is copied into review evidence.      |
| Trusted webhook source address propagation | Backend owner with security review | Before any provider enablement | The reviewed edge path supplies the rightmost trusted forwarded address used by the fail-closed webhook request budgets; missing address behavior is exercised without production traffic. |
| Full #4406 release gate                    | #4406 coordinator                  | Before production enablement   | Independent privacy and reliability phases are complete and the coordinator clears the exact security evidence head.                                                                       |

No provider dashboard, secret, production data, production configuration, infrastructure, or
deployment operation was accessed during this review.
