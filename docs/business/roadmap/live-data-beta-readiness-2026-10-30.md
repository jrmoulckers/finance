# Live-data beta readiness - October 30, 2026

**Decision:** Not ready for live-data beta sign-off or provider enablement.
**Tracking:** [#4462](https://github.com/jrmoulckers/finance/issues/4462).
**Scope:** Coordinated web sync coverage, billing regression verification, and
bounded native parity assessment. This is an engineering evidence assessment,
not authorization to deploy, configure providers, or submit applications.

This assessment supports `PROD-REL-001` and `PROD-PLAN-003`; obligations remain
in [Product authority](https://github.com/jrmoulckers/product). Historical
roadmaps and closed milestones do not establish current release readiness.

## Current evidence

| Workstream      | Outcome                                                                                                                                                                                                                                                                                                                                                           | Limit                                                                                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency gate | [#4466](https://github.com/jrmoulckers/finance/pull/4466) merged as `aabe6d969cbdc162203ef1255ac062332b4913ac`. Compatible dependency updates removed all high/critical audit findings without changing checks.                                                                                                                                                   | Four moderate and three low findings remain reported; this is not a zero-vulnerability declaration.                                                                                            |
| Billing         | [#4463](https://github.com/jrmoulckers/finance/pull/4463) merged as `1038a33857b6bfd026a37e31ebd4eabcb31b67d7`. Fixed an explicit response-envelope type mismatch without changing runtime policy. Synthetic handlers and real disposable PostgreSQL/gateway CI passed.                                                                                           | No local database execution, separate entitlement API SQL suite, staging exercises, or new independent sign-off is claimed.                                                                    |
| Web sync        | [#4464](https://github.com/jrmoulckers/finance/pull/4464) merged as `9527c86d74c6af5b5b5604838043f1ceb1c82cf9`, adding a real-service production-PWA scenario. Targeted tests, type-check, production build, discovery, and required CI passed. Authorized cleanup removed a synthetic scanner fixture from owned branch history without changing scanner policy. | Coverage is delivered, but actual scenario execution has zero passes and one prerequisite failure: approved local public configuration and an isolated Supabase gateway are absent.            |
| Native          | Shared JVM tests and Windows tests/JAR passed; unchanged-source historical Android/iOS build evidence was inspected.                                                                                                                                                                                                                                              | Android production sync DI is incomplete, iOS selects stub/simulated sync, and Windows acknowledges without transport. Actual native replication remains unverified and requires cutover work. |

The initial evidence baseline was `5d502fc2e896df454fb923a0557ec3e335c484d5`.
Billing was revalidated after dependency remediation on
`0aa71e6231e8bd6b84d3ebd419a2f8e509759acc`.
Detailed commands, counts, source references, and subsequent delivery updates
are preserved in the [coordinator evidence thread](https://github.com/jrmoulckers/finance/issues/4462).

## Verification, not inference

| Command or durable check                                                                                                                                                     | Result                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:billing-provider-functions -w services/api`                                                                                                                    | Passed: 96 tests on integrated billing head.                                                                                                                               |
| `npm run test:entitlement-functions -w services/api`                                                                                                                         | Passed: 30 tests.                                                                                                                                                          |
| `npm run test:bank-entitlements -w services/api`                                                                                                                             | Passed: 25 tests.                                                                                                                                                          |
| `npm run test:bank-revocation-handlers -w services/api`                                                                                                                      | Passed: 59 tests.                                                                                                                                                          |
| `npm run test:sync-contract -w services/api`                                                                                                                                 | Passed: 19 tests; not browser/native replication proof.                                                                                                                    |
| [Integrated billing database/gateway CI](https://github.com/jrmoulckers/finance/actions/runs/41112483082/job/124260822492)                                                   | Passed billing replay, cap/remediation, durable revocation, concurrency, and nine gateway cases against a real disposable database.                                        |
| `npm run test -w apps/web -- src/__tests__/live-sync-environment.test.ts src/db/sync/powersync/__tests__/database.test.ts src/db/sync/powersync/__tests__/connector.test.ts` | Passed: 25 tests in three files on the rebuilt web branch.                                                                                                                 |
| `npm run type-check -w apps/web`                                                                                                                                             | Passed on the rebuilt web branch, including runner/config types.                                                                                                           |
| `npm exec -w apps/web -- playwright test --config playwright.sync.config.ts`                                                                                                 | Blocked: zero passes, one prerequisite failure. No real auth/offline/replication acceptance is claimed.                                                                    |
| `.\gradlew.bat :packages:core:jvmTest :packages:sync:jvmTest :apps:windows:test :apps:windows:jar --no-daemon --console=plain`                                               | Passed at initial baseline: core 2,781, sync 458, Windows 162 tests; zero failures/errors/skips. Shared mocked transport tests are not real replication proof.             |
| Android/iOS runtime validation                                                                                                                                               | Not performed. Android SDK unavailable locally; iOS requires a suitable macOS runner. Historical unchanged-source build/test evidence is not runtime integration evidence. |

## Execution sequence and gates

1. **Coverage delivery is complete.** Web coverage, dependency remediation, and
   billing prerequisite changes are merged after integrated checks. The web head
   had 31 successful checks, 12 skipped, one neutral, and no failed or pending
   checks before merge; this does not execute the real-service scenario.
2. **Provision approved synthetic local services.** Human environment owner
   supplies isolated Supabase Auth, auth edge functions, PostgREST, reviewed
   migrations/RLS/household provisioning, and PowerSync connected to that same
   database with compatible JWT verification and sync rules. Existing healthy
   shared containers are not evidence of compatibility and must not be reset.
   Supply public local client configuration without exposing secret files or
   service-role credentials. Do not configure live bank providers.
3. **Run the real web acceptance scenario.** Web owner verifies explicit sync
   consent, authenticated CRUD, offline reload/persistence, reconnect and bounded
   replay, identical records/integer amounts on a second browser, cross-household
   denial, and logout/account-switch isolation. Record every assertion; stop at
   the first reproducible blocker and route fixes to the owning surface.
4. **Complete the native cutover boundary.** Architecture, database, and native
   owners agree real transport and local-schema contracts before changing
   consumers. Serialize schema/shared changes. Do not point a legacy REST
   provider at a PowerSync URL or label no-op acknowledgements as synchronization.
   Add production DI coverage, durable replay/cursors, and actual two-device
   tests on SDK-equipped Android, Windows, and macOS/iOS runners.
5. **Clear operational gates separately.** SRE, backend, and database owners
   perform authorized synthetic staging collector/scheduler, independent adapter
   disable, and deterministic projection-shadow exercises. Their October 10
   review dates are overdue, not automatically extended.
6. **Make an explicit release decision.** Review integrated-head evidence,
   platform runtime gaps, remaining defects, processor/legal prerequisites, and
   independent sign-offs before provider enablement or release. A passing build
   or merged coverage change cannot substitute for this decision.

## Needs human action

- The human selected preparation of a reviewed isolated-stack setup plan on
  October 30. That documentation work is assigned separately; provisioning
  remains unexecuted and unapproved.
- Approve/provision the isolated synthetic local environment and public client
  configuration before running the real web scenario. No shared-container
  mutation, credential access, reset, or migration execution was authorized by
  the branch-history cleanup decision.
- Arrange SDK-equipped Android and macOS/iOS execution where needed; signing and
  store access are not part of validation.
- Resolve the existing external processor/legal/secret and staging-operation
  prerequisites in the [entitlement reliability sign-off](../../ops/entitlement-reliability-signoff.md).
  Code merges do not authorize deployment or provider enablement.

The broad [live-data epic #3935](https://github.com/jrmoulckers/finance/issues/3935)
and [banking integration #3846](https://github.com/jrmoulckers/finance/issues/3846)
remain distinct from the completed prerequisite fixes. Real bank ingestion and
native replication are not established by the new web scenario.
