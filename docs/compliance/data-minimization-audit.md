# GDPR Data Minimization Audit

## Scope and evidence

This audit reviews data necessity and retention based on:

- `services/api/supabase/migrations/20260306000001_initial_schema.sql`
- `services/api/supabase/functions/auth-webhook/index.ts`
- `services/api/supabase/functions/_shared/logger.ts`
- `packages/core/src/commonMain/kotlin/com/finance/core/monitoring/CrashReporter.kt`
- `packages/core/src/commonMain/kotlin/com/finance/core/monitoring/MetricsCollector.kt`
- `apps/android/src/main/kotlin/com/finance/android/di/AppModule.kt`
- `apps/android/src/main/kotlin/com/finance/android/logging/TimberCrashReporter.kt`
- `apps/web/src/lib/monitoring.ts`

## Executive summary

The initial schema is relatively lean for a sync-first finance product, but the main minimization pressure points are:

- `users.display_name` is mandatory even though account provisioning can function with only an email and user ID.
- `users.avatar_url`, `accounts.icon`, `accounts.color`, `categories.icon`, `categories.color`, `goals.icon`, and `goals.color` are optional UX metadata and should stay optional.
- `transactions.note` is high-risk free text and should be tightly bounded, encrypted at rest, and excluded from logs and telemetry.
- Optional telemetry is currently default-off in shared/common code and Android DI, and web Sentry is disabled pending consent UI.
- Backend logging guidance is strong, but `logger.ts` still allows `userId`, and `auth-webhook/index.ts` has one direct `console.log` path that emits `record.id`.

### Decision labels

- **Required** — necessary for core finance, sync, security, or relational integrity
- **Conditional** — needed only for a specific feature or state
- **Optional UX** — user-experience enhancement only; keep optional
- **Review** — reconsider necessity, nullability, retention, or collection timing

## Field-by-field necessity review

### `users`

| Field           | Necessity   | Review                                                                                                          |
| --------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `id`            | Required    | Primary key and sync identity                                                                                   |
| `email`         | Required    | Needed for authentication and account recovery                                                                  |
| `display_name`  | Review      | Useful for household UX, but should not be mandatory at signup if the product can operate with a fallback label |
| `avatar_url`    | Optional UX | Not used by `auth-webhook/index.ts` today; only collect and store if avatars are displayed                      |
| `currency_code` | Required    | Needed for defaults and presentation                                                                            |
| `created_at`    | Required    | Operational audit and sync metadata                                                                             |
| `updated_at`    | Required    | Operational audit and sync metadata                                                                             |
| `deleted_at`    | Required    | Supports soft deletion and downstream erasure workflows                                                         |

### `households`

| Field        | Necessity | Review                                                                                     |
| ------------ | --------- | ------------------------------------------------------------------------------------------ |
| `id`         | Required  | Primary key                                                                                |
| `name`       | Required  | Needed for shared-finance UX, though it should remain user-editable and not over-validated |
| `created_by` | Required  | Ownership and authorization link                                                           |
| `created_at` | Required  | Operational audit                                                                          |
| `updated_at` | Required  | Operational audit                                                                          |
| `deleted_at` | Required  | Soft delete support                                                                        |

### `household_members`

| Field          | Necessity | Review                                  |
| -------------- | --------- | --------------------------------------- |
| `id`           | Required  | Primary key                             |
| `household_id` | Required  | Relationship integrity                  |
| `user_id`      | Required  | Relationship integrity                  |
| `role`         | Required  | Authorization and household governance  |
| `joined_at`    | Required  | Membership timeline and troubleshooting |
| `created_at`   | Required  | Operational audit                       |
| `updated_at`   | Required  | Operational audit                       |
| `deleted_at`   | Required  | Soft delete support                     |

### `accounts`

| Field           | Necessity   | Review                                                   |
| --------------- | ----------- | -------------------------------------------------------- |
| `id`            | Required    | Primary key                                              |
| `household_id`  | Required    | Household scoping                                        |
| `name`          | Required    | User-facing identification of the account                |
| `type`          | Required    | Needed for behavior and reporting                        |
| `currency_code` | Required    | Multi-currency support                                   |
| `balance_cents` | Required    | Core financial state                                     |
| `is_active`     | Required    | Enables archive and deactivate behavior without deletion |
| `icon`          | Optional UX | Convenience metadata only                                |
| `color`         | Optional UX | Convenience metadata only                                |
| `sort_order`    | Optional UX | Presentation-only ordering                               |
| `created_at`    | Required    | Operational audit                                        |
| `updated_at`    | Required    | Operational audit                                        |
| `deleted_at`    | Required    | Soft delete support                                      |
| `sync_version`  | Required    | Sync conflict and version control                        |
| `is_synced`     | Required    | Sync state management                                    |

### `categories`

| Field          | Necessity   | Review                                              |
| -------------- | ----------- | --------------------------------------------------- |
| `id`           | Required    | Primary key                                         |
| `household_id` | Required    | Household scoping                                   |
| `name`         | Required    | User-facing label                                   |
| `icon`         | Optional UX | Convenience metadata only                           |
| `color`        | Optional UX | Convenience metadata only                           |
| `parent_id`    | Conditional | Needed only for nested categories                   |
| `is_income`    | Required    | Behavioral distinction for reporting and validation |
| `sort_order`   | Optional UX | Presentation-only ordering                          |
| `created_at`   | Required    | Operational audit                                   |
| `updated_at`   | Required    | Operational audit                                   |
| `deleted_at`   | Required    | Soft delete support                                 |
| `sync_version` | Required    | Sync conflict and version control                   |
| `is_synced`    | Required    | Sync state management                               |

### `transactions`

| Field                 | Necessity   | Review                                                                       |
| --------------------- | ----------- | ---------------------------------------------------------------------------- |
| `id`                  | Required    | Primary key                                                                  |
| `household_id`        | Required    | Household scoping                                                            |
| `account_id`          | Required    | Ledger linkage                                                               |
| `category_id`         | Conditional | Needed when categorization is used                                           |
| `amount_cents`        | Required    | Core financial state                                                         |
| `currency_code`       | Required    | Multi-currency support                                                       |
| `type`                | Required    | Distinguishes expense, income, transfer, and related flows                   |
| `payee`               | Conditional | Valuable for reconciliation and search, but should remain optional           |
| `note`                | Review      | Highest minimization risk; free text can capture sensitive data unexpectedly |
| `date`                | Required    | Core ledger chronology                                                       |
| `is_recurring`        | Required    | Needed for recurring-flow behavior                                           |
| `recurring_rule`      | Conditional | Needed only when `is_recurring = true`                                       |
| `transfer_account_id` | Conditional | Needed only for transfers                                                    |
| `status`              | Required    | Reconciliation and workflow state                                            |
| `created_at`          | Required    | Operational audit                                                            |
| `updated_at`          | Required    | Operational audit                                                            |
| `deleted_at`          | Required    | Soft delete support                                                          |
| `sync_version`        | Required    | Sync conflict and version control                                            |
| `is_synced`           | Required    | Sync state management                                                        |

### `budgets`

| Field           | Necessity   | Review                            |
| --------------- | ----------- | --------------------------------- |
| `id`            | Required    | Primary key                       |
| `household_id`  | Required    | Household scoping                 |
| `category_id`   | Required    | Budget target linkage             |
| `amount_cents`  | Required    | Core budget rule                  |
| `currency_code` | Required    | Multi-currency support            |
| `period`        | Required    | Needed to interpret recurrence    |
| `start_date`    | Required    | Budget period anchor              |
| `end_date`      | Conditional | Needed only for finite budgets    |
| `created_at`    | Required    | Operational audit                 |
| `updated_at`    | Required    | Operational audit                 |
| `deleted_at`    | Required    | Soft delete support               |
| `sync_version`  | Required    | Sync conflict and version control |
| `is_synced`     | Required    | Sync state management             |

### `goals`

| Field           | Necessity   | Review                            |
| --------------- | ----------- | --------------------------------- |
| `id`            | Required    | Primary key                       |
| `household_id`  | Required    | Household scoping                 |
| `name`          | Required    | User-facing label                 |
| `target_cents`  | Required    | Core goal rule                    |
| `current_cents` | Required    | Progress tracking                 |
| `currency_code` | Required    | Multi-currency support            |
| `target_date`   | Conditional | Needed only for date-bound goals  |
| `icon`          | Optional UX | Convenience metadata only         |
| `color`         | Optional UX | Convenience metadata only         |
| `created_at`    | Required    | Operational audit                 |
| `updated_at`    | Required    | Operational audit                 |
| `deleted_at`    | Required    | Soft delete support               |
| `sync_version`  | Required    | Sync conflict and version control |
| `is_synced`     | Required    | Sync state management             |

## Signup data collection review

`services/api/supabase/functions/auth-webhook/index.ts` processes new `auth.users` inserts and reads:

- `record.id`
- `record.email`
- optional `record.raw_user_meta_data.full_name`
- optional `record.raw_user_meta_data.name`
- optional `record.raw_user_meta_data.avatar_url`

The current implementation is fairly minimized because it only forwards `id`, `email`, and a derived `displayName` to the signup RPC. `avatar_url` is accepted in the webhook payload type but is not persisted in the code path shown. The main remaining minimization question is whether `display_name` must be mandatory at provisioning time.

## Retention and TTL recommendations

The initial schema file does **not** define `audit_log`, `sync_health_logs`, or `invitations` tables. If those operational tables are added in future migrations, adopt retention by default:

| Table              | Recommended TTL | Reason                                                                                                        |
| ------------------ | --------------- | ------------------------------------------------------------------------------------------------------------- |
| `audit_log`        | **6 months**    | Long enough for security and compliance investigations without keeping operational event history indefinitely |
| `sync_health_logs` | **3 months**    | Enough for reliability trend analysis while limiting device and server observability retention                |
| `invitations`      | **72 hours**    | Invitation links and email-based collaboration artifacts should expire quickly                                |

Implementation note: apply TTL with scheduled purge jobs or partition-based retention so expiry is automatic rather than manual.

## SDK and logging data collection review

| Surface                                | Current state                                                                               | Minimization assessment                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `MetricsCollector.kt`                  | Anonymous events only; gated by `consentProvider()` on every call                           | Strong default, assuming event properties stay schema-controlled                                           |
| `CrashReporter.kt`                     | Requires consent and pseudonymous IDs only                                                  | Strong contract, but platform implementations must preserve it                                             |
| Android `TimberCrashReporter.kt`       | On-device logging only; disabled by current `consentProvider = { false }` wiring            | Low current exposure; still avoid logging raw context maps that may grow over time                         |
| Android placeholder Sentry integration | Present in `apps/android/.../SentryConfig.kt` but not active in DI                          | Safe while disabled; review sampling, scrubbing, and user-ID handling before activation                    |
| Web `monitoring.ts`                    | Sentry disabled pending consent UI; scrubbers remove PII and financial patterns             | Good preconditions; ensure consent is checked before any SDK import or init                                |
| Backend `logger.ts`                    | Structured logger bans sensitive fields in comments, but schema allows optional `userId`    | Treat `userId` as personal data; hash or omit unless operationally necessary                               |
| `auth-webhook/index.ts`                | Success path uses structured logger, but idempotent path calls `console.log(... record.id)` | Replace raw `console.log` with structured logger and avoid emitting persistent identifiers when not needed |

## Anonymization and pseudonymization opportunities

1. **Telemetry user identity** — if a user identifier is needed for crash grouping, use a rotatable pseudonymous ID derived from a one-way mapping rather than a stable backend UUID.
2. **Operational logs** — prefer request IDs, function names, and status codes over user-linked identifiers in `logger.ts` contexts.
3. **Free-text transaction notes** — consider local-only storage options, stricter length caps, or on-device classification instead of server-side processing.
4. **Display names** — allow null or empty display names and render a local fallback label until the user voluntarily adds one.
5. **Deleted records** — where legal and operationally possible, convert soft-deleted rows into tombstones containing only the minimum sync metadata required for replication cleanup.

## Recommendations

1. Make `users.display_name` nullable or defer collection until after account creation.
2. Keep `avatar_url` optional and do not start persisting it unless a concrete UI need exists.
3. Add explicit product rules for `transactions.note`: character limit, no secrets guidance, encryption-at-rest confirmation, and exclusion from logs and telemetry.
4. Treat `userId` in backend logs as personal data and minimize or pseudonymize it.
5. Add future retention automation for `audit_log`, `sync_health_logs`, and `invitations` at table creation time.
6. Before enabling Android or web Sentry, document the exact event schema, sampling rates, and scrubbing guarantees in the compliance inventory.
