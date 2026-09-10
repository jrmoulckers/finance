# Entitlement reliability sign-off

| Field                        | Value                                                        |
| ---------------------------- | ------------------------------------------------------------ |
| Status                       | Conditional pass; provider enablement is blocked             |
| Review date                  | 2026-09-10                                                   |
| Reviewed integrated baseline | `24ceef91c511e3e9c8f82da0d52ab420fa0d47d6`                   |
| Security evidence            | [PR #4426](https://github.com/jrmoulckers/finance/pull/4426) |
| Tracking issue               | [#4406](https://github.com/jrmoulckers/finance/issues/4406)  |

This is the independent SRE review of the server-authoritative entitlement program through the
merged security sign-off. It covers reliability behavior and synthetic evidence only. It does not
authorize provider configuration, secret access, deployment, production operations, or production
enablement.

## Decision

The integrated implementation is suitable to proceed to non-production operational validation.
Provider enablement remains blocked until the open execution-evidence finding, the production gates
in this document, and the remaining independent #4406 sign-offs are cleared.

The review found two reliability gaps:

| ID            | Severity | Status   | Finding                                                                                                                                    | Resolution or required action                                                                                                                                           |
| ------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REL-ENT-001` | High     | Resolved | Required entitlement signals were scattered across database and function outcomes without one bounded-cardinality SLO and metric contract. | Added an executable, validated contract for ingestion, event disposition, projection, reconciliation, revocation backlog, retry, and dead-letter telemetry.             |
| `REL-ENT-002` | High     | Open     | The deterministic projection rebuild SQL suite is not invoked by any current workflow, and the local PostgreSQL stack was unavailable.     | DevOps must wire `test:billing-entitlements` into the disposable PostgreSQL integration job and obtain a green run against the exact integrated head before enablement. |

No implementation defect was found in provider-outage handling, deterministic projection replay,
revocation retry/idempotency, downgrade fallbacks, client authority, or append-only ledger
protection.

## SLOs and error-budget policy

All SLOs use a rolling 30-day window. Planned maintenance counts as failure unless traffic is
prevented before entering the measured population. Synthetic and sandbox traffic is excluded from
production SLO arithmetic but is retained as release evidence.

| User outcome                   | SLI                                                                                  | Objective | Error budget | Fast-burn / page condition                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------ | --------: | -----------: | --------------------------------------------------------------------------------------------- |
| Evidence becomes authoritative | Authenticated provider events applied or safely rejected within 5 minutes of receipt |     99.9% |         0.1% | Ingestion lag at least 15 minutes, or 14.4x burn for 10 minutes                               |
| Projection stays correct       | Scheduled shadow comparisons with zero divergent billing-account projections         |    99.99% |        0.01% | Any divergence; paid authorization continues from the last server projection while isolated   |
| Reconciliation stays fresh     | Active provider identities reconciled successfully within the previous 24 hours      |     99.5% |         0.5% | Oldest reconciliation at least 48 hours, or both adapters stale beyond 24 hours               |
| Revocation completes durably   | Revocation jobs reach confirmed revoked/already-invalid disposition within 6 hours   |     99.9% |         0.1% | Any dead letter, oldest live backlog at least 6 hours, or retained credential near its expiry |

Rejected events, duplicates, retries, and backlog volume are diagnostic signals rather than
separate availability objectives. Rejections can represent correct fail-closed behavior and
duplicates are expected during provider retry. They consume an error budget only when the related
user outcome misses its threshold.

**Budget decisions:**

- At 25% budget consumed, the backend owner reviews adapter and reconciliation error classes.
- At 50%, pause entitlement rollout and non-essential adapter changes.
- At 100%, keep provider enablement or expansion blocked until the SRE owner accepts recovery
  evidence and the 7-day burn is below the objective.
- Projection divergence or a revocation dead letter bypasses budget arithmetic and pages
  immediately because either can change access or leave a provider Item billable.

## Secret-safe metrics

The executable contract is
[`services/api/monitoring/entitlement-reliability.ts`](../../services/api/monitoring/entitlement-reliability.ts).
It accepts only aggregate values, permits only the fixed `revenuecat` and `stripe` provider label,
and emits no free-form dimensions. The collector must aggregate inside the server trust boundary
before constructing this payload.

| Metric                                               | Type    | Source and meaning                                                                                    |
| ---------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `finance_entitlement_ingestion_lag_seconds`          | Gauge   | Per provider, age of the oldest `pending` or `scheduled` authenticated event; zero when none          |
| `finance_entitlement_events_received_total`          | Counter | Per provider, authenticated normalized evidence accepted for record/apply                             |
| `finance_entitlement_events_rejected_total`          | Counter | Per provider, persisted evidence ending in `rejected`; alert on rate change, not raw count alone      |
| `finance_entitlement_events_duplicate_total`         | Counter | Per provider, record attempts resolving to an existing provider/environment/event tuple               |
| `finance_entitlement_reconciliation_age_seconds`     | Gauge   | Per provider, age since the last complete successful reconciliation sweep                             |
| `finance_entitlement_projection_divergence_accounts` | Gauge   | Count from a shadow replay comparison; zero is required                                               |
| `finance_entitlement_revocation_backlog_jobs`        | Gauge   | Open `pending_reconciliation`, `pending_revocation`, `processing`, `retry_wait`, and `exhausted` jobs |
| `finance_entitlement_revocation_oldest_age_seconds`  | Gauge   | Age of the oldest open revocation job                                                                 |
| `finance_entitlement_revocation_retries_total`       | Counter | Transitions to `retry_wait`, including recovered expired leases                                       |
| `finance_entitlement_revocation_dead_letter_jobs`    | Gauge   | `exhausted` or `abandoned` jobs requiring operator disposition; zero is required                      |

Allowed fields are metric name, kind, unit, numeric value, and the fixed provider label. Never add
user, household, billing-account, connection, event, subscription, product, environment, request,
or correlation identifiers; credentials; ciphertext; raw error text; merchant or financial
values. Error classification remains a separate fixed-code counter owned by the adapter. A
dashboard or alert must link this runbook, not a raw record.

### Alert routing

| Symptom                                            | Severity | Owner                                        | Initial action                                   |
| -------------------------------------------------- | -------- | -------------------------------------------- | ------------------------------------------------ |
| Ingestion lag 5 minutes or reconciliation 24 hours | Warning  | Backend adapter owner                        | Provider-outage runbook                          |
| Rejected ratio above 5% over 15 minutes            | Warning  | Backend owner with security review           | Confirm fixed error classes and signature health |
| Duplicate ratio above 25% over 15 minutes          | Warning  | Backend owner                                | Confirm provider retry storm and idempotency     |
| Any projection divergence                          | Critical | Backend and database owners, SRE coordinator | Adapter-disable and projection-rebuild runbooks  |
| Revocation oldest age 1 hour or retries surging    | Warning  | Backend owner                                | Provider-outage and revocation recovery          |
| Revocation age 6 hours or any dead letter          | Critical | Backend and database owners, SRE coordinator | Disable affected adapter and preserve outbox     |

## Runbooks

These procedures describe required confirmations and stop conditions. Deployment, provider
configuration, database changes, and production invocations remain human-gated.

### Provider outage

**Trigger:** ingestion lag or reconciliation age breaches, adapter returns retryable unavailability,
or revocation retries increase.

1. Confirm the symptom from aggregate metrics and fixed error codes. Do not inspect or copy provider
   payloads, identities, credentials, or financial records into incident evidence.
2. Confirm the authoritative projection API remains server-backed. Client SDK state, local cache,
   JWT claims, feature flags, and the legacy subscription table remain non-authoritative.
3. Leave authenticated events and revocation jobs durable. Do not mark failed provider work
   successful, purge encrypted retry capability, reactivate `revocation_pending` connections, or
   relax cache expiry.
4. If the failure is isolated to one adapter, follow **Adapter disable**. Otherwise pause rollout
   and keep reconcilers on bounded backoff.
5. Recovery requires two successful reconciliation sweeps, ingestion lag below 5 minutes,
   projection divergence zero, no dead letters, and a decreasing revocation backlog.

**Stop and escalate:** any projection divergence, terminal credential-retention deadline within 24
hours, unexplained ledger write, or evidence that a client state granted server access.

### Adapter disable

**Trigger:** forged/incorrect normalization, provider retry storm, sustained outage, or projection
divergence attributable to one adapter.

1. Record the exact last-known-good application revision and aggregate metric snapshot.
2. Have the deployment owner stop new webhook/confirmation/reconciliation ingress for only the
   affected adapter. Disabling ingress must not delete its ledger evidence, grants, projections,
   purchase bindings, or revocation outbox.
3. Keep server authorization on the last valid, expiring projection. Do not restore client or
   provider SDK authority and do not extend client cache expiry.
4. Drain already-authenticated evidence only after the backend owner confirms the normalizer. Keep
   revocation retries active when their provider operation is known safe; otherwise preserve jobs
   without claiming them.
5. Re-enable only after synthetic signature, ordering, reconciliation, projection, and duplicate
   tests pass and the recovery conditions below hold.

**Stop and escalate:** the only available disable mechanism also bypasses server authorization,
drops evidence, exposes provider identifiers, or makes provider work appear successful.

### Deterministic projection rebuild

**Trigger:** non-zero divergence or a reviewed normalizer/projection correction.

1. Disable affected adapter ingress. Capture aggregate row counts and a transaction-local digest of
   immutable normalized evidence; never export identifiers or raw evidence.
2. In an approved synthetic or controlled environment, shadow replay the affected billing accounts
   in canonical account/event order and compare subscriptions, active grants, user projections, and
   household projections. Emit only the divergent-account count.
3. If the shadow result is deterministic, the database owner may invoke
   `rebuild_billing_entitlements` for the smallest affected account set. Never delete or rewrite
   `billing_provider_events`.
4. Recompute the comparison and immutable-evidence digest. Require zero divergence, identical
   evidence count/digest, and no authorization from a client-controlled surface.
5. Run reconciliation through the same append/apply path before considering adapter recovery.

**Stop and escalate:** replay changes immutable evidence, two replays differ, scope cannot be
bounded, a ledger protection trigger is absent, or the rebuild would require restoring client
authority.

### Rollback

1. Prefer disabling the affected adapter and returning its function code to the last-known-good
   revision. Keep the ledger, projection, and revocation outbox schemas intact.
2. Do not run the Stage 7 down migration after any account-deletion handoff or provider work. Its
   guard correctly refuses reversal after an externally irreversible or ambiguous operation.
3. Do not reactivate `revocation_pending` connections after provider work starts. Continue serving
   historical financial data and ungated export/deletion/privacy controls.
4. Validate the last-known-good adapter with synthetic evidence, then follow **Recovery**.

**Stop and escalate:** rollback asks to delete normalized evidence, mutate historical event fields,
purge a pending credential, grant from local/client state, or override the migration guard.

### Recovery

1. Confirm adapter authentication and normalization with synthetic provider-shaped events only.
2. Run bounded reconciliation through the shared idempotent append/apply path.
3. Shadow-compare and, if required, rebuild projections as above. Require zero divergence and
   unchanged immutable-evidence digest.
4. Confirm revocation leases recover as failures, retries remain bounded, duplicate results are
   stale no-ops, dead letters are zero, and the oldest backlog is below 1 hour and decreasing.
5. Observe two complete reconciliation intervals with ingestion lag below 5 minutes. The SRE owner
   then records recovery evidence; a human deployment owner decides whether to re-enable ingress.

Recovery is not proven by a healthy process, reachable host, successful deployment, or provider
status page alone. It requires correct server authorization, deterministic projection, durable
revocation, and preserved operator access.

## Independent evidence review

| Reliability case                                 | Result                         | Integrated evidence                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Provider outage                                  | Pass                           | RevenueCat and Stripe reconciliation tests return bounded retryable failures; account deletion performs no provider call; revocation SQL records outage as `retry_wait` with bounded jitter while retaining encrypted capability.                                                                                                    |
| Deterministic projection rebuild                 | Design pass; execution blocked | Static review confirms `billing-entitlements-integration.test.sql` deletes only mutable derived fixtures, replays all accounts in canonical order, compares subscriptions/grants/user/household projections bidirectionally, and asserts normalized provider evidence is unchanged. The current workflow does not invoke this suite. |
| Revocation retry and idempotency                 | Pass                           | Stage 7 SQL and concurrency suites cover lease recovery, bounded retries, two exhausted recoveries, stale leases, duplicate terminal delivery, finalization races, credential purge, and operator-safe reconciliation counts.                                                                                                        |
| Catalog downgrade fallback                       | Pass                           | The durable SQL suite proves explicit retention selection, Family-to-Premium retention of two, deterministic `created_at, id` tie-breaking without selection, and Premium-to-Free/Plus disabling every remaining live provider Item while preserving history.                                                                        |
| Rollback and non-restoration of client authority | Pass                           | Append-only triggers reject evidence mutation; the Stage 7 down migration refuses rollback after provider work or account erasure; server projections remain the only authority in ADR-0027 and integration tests deny direct client mutation/access.                                                                                |

All reviewed fixtures are synthetic. The review did not access provider secrets, dashboards,
production data, production configuration, infrastructure, deployment, or production operations.

### Verification evidence

| Command or durable check                                                                                                                                | Result                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npx vitest run services/api/monitoring/entitlement-reliability.test.ts services/api/monitoring/metrics.test.ts services/api/monitoring/alerts.test.ts` | 3 files, 40 tests passed                                                                              |
| Targeted RevenueCat service/reconciliation and Stripe reconciliation Deno suite                                                                         | 11 tests passed                                                                                       |
| `npm run test:bank-revocation-handlers -w services/api`                                                                                                 | 59 tests passed                                                                                       |
| `npm run test:sync-contract -w services/api`                                                                                                            | 19 tests passed                                                                                       |
| `npm run test -w apps/web -- --run src/entitlements/entitlements.test.ts src/billing/productBilling.test.ts`                                            | 2 files, 16 tests passed                                                                              |
| `.\gradlew.bat :packages:core:jvmTest :apps:windows:test --no-daemon`                                                                                   | Build successful                                                                                      |
| `npm run ci:check` and `npm run docs:links:check`                                                                                                       | Passed                                                                                                |
| [Stage 7 Entitlement Gateway Integration](https://github.com/jrmoulckers/finance/actions/runs/34313328974/job/102344327954) at merged PR #4423          | Passed disposable PostgreSQL revocation, concurrency, gateway, handler, and privacy/sync suites       |
| Local `billing-entitlements-integration.test.sql` execution                                                                                             | Blocked: Docker Desktop's Linux-engine API returned HTTP 500 and no local `psql` client was installed |
| Current CI search for `test:billing-entitlements`                                                                                                       | No workflow invocation found; tracked as `REL-ENT-002`                                                |

## Residual risks and production gates

| Risk / gate                                                   | Accountable owner                           | Review or expiry date | Required evidence before clearance                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projection rebuild SQL execution is not CI-enforced           | DevOps owner with database and SRE review   | 2026-09-17            | Add the existing `test:billing-entitlements` script to the disposable PostgreSQL integration job and record a green run against the integrated entitlement head.                   |
| Metrics are not yet wired to a production collector/dashboard | SRE owner with backend implementation owner | 2026-10-10            | Synthetic staging scrape contains every contract metric, only approved labels, working alert routes, and no identifiers, credentials, ciphertext, raw errors, or financial values. |
| Adapter-disable action is deployment-specific and unexercised | Backend owner with DevOps and SRE review    | 2026-10-10            | Synthetic staging exercise disables one adapter without changing server authorization, ledger history, the other adapter, or the revocation outbox.                                |
| Projection shadow comparison is not scheduled                 | Database owner with SRE review              | 2026-10-10            | Synthetic staging job produces only aggregate divergence and proves two replays are deterministic with an unchanged immutable-evidence digest.                                     |
| Full #4406 release gate                                       | #4406 coordinator                           | Before enablement     | Security, privacy, and reliability evidence all reference integrated heads, and the coordinator explicitly clears provider enablement.                                             |

Until every row is cleared, RevenueCat/Stripe SDK or webhook configuration, provider secrets,
product configuration, deployment, and production enablement remain blocked.
