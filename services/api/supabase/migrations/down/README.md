# Reverse (Down) Migrations

**Issues:** #893, #1322, #1323

---

## Overview

This directory contains reverse migration files for every up migration in the parent directory. Each `.down.sql` file precisely undoes the corresponding up migration.

## Usage

Reverse migrations must be applied **in reverse chronological order** (newest first).

### Rolling Back a Single Migration

```bash
# Identify the migration to roll back
ls -la services/api/supabase/migrations/

# Apply the corresponding down migration
psql -h <host> -U postgres -d postgres \
  -f services/api/supabase/migrations/down/<migration-name>.down.sql
```

### Rolling Back Multiple Migrations

Apply down migrations in **reverse order**:

```bash
# Example: roll back the last 3 migrations
psql -f down/20260325000002_read_only_rate_limit_status.down.sql
psql -f down/20260325000001_enhanced_cleanup_and_balance.down.sql
psql -f down/20260324000004_webhook_infrastructure.down.sql
```

### Full Schema Teardown

To completely remove the schema, run ALL down migrations in reverse order:

```bash
# WARNING: This deletes ALL data. Requires human approval.
for f in $(ls -r down/*.down.sql); do
  echo "Applying: $f"
  psql -h <host> -U postgres -d postgres -f "$f"
done
```

## File Naming Convention

Each down migration matches its up migration with a `.down.sql` suffix:

| Up Migration                                                | Down Migration                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `20260306000001_initial_schema.sql`                         | `down/20260306000001_initial_schema.down.sql`                         |
| `20260306000002_rls_policies.sql`                           | `down/20260306000002_rls_policies.down.sql`                           |
| `20260306000003_auth_config.sql`                            | `down/20260306000003_auth_config.down.sql`                            |
| `20260307000001_monitoring.sql`                             | `down/20260307000001_monitoring.down.sql`                             |
| `20260315000001_export_audit_log.sql`                       | `down/20260315000001_export_audit_log.down.sql`                       |
| `20260316000001_edge_function_security.sql`                 | `down/20260316000001_edge_function_security.down.sql`                 |
| `20260316000002_fix_invitation_rls.sql`                     | `down/20260316000002_fix_invitation_rls.down.sql`                     |
| `20260323000001_cleanup_and_balance_triggers.sql`           | `down/20260323000001_cleanup_and_balance_triggers.down.sql`           |
| `20260323000002_recurring_transactions.sql`                 | `down/20260323000002_recurring_transactions.down.sql`                 |
| `20260323000003_rate_limits.sql`                            | `down/20260323000003_rate_limits.down.sql`                            |
| `20260324000001_notification_infrastructure.sql`            | `down/20260324000001_notification_infrastructure.down.sql`            |
| `20260324000002_performance_indexes.sql`                    | `down/20260324000002_performance_indexes.down.sql`                    |
| `20260324000003_automated_maintenance.sql`                  | `down/20260324000003_automated_maintenance.down.sql`                  |
| `20260324000004_webhook_infrastructure.sql`                 | `down/20260324000004_webhook_infrastructure.down.sql`                 |
| `20260325000001_enhanced_cleanup_and_balance.sql`           | `down/20260325000001_enhanced_cleanup_and_balance.down.sql`           |
| `20260325000002_read_only_rate_limit_status.sql`            | `down/20260325000002_read_only_rate_limit_status.down.sql`            |
| `20260326000001_production_readiness.sql`                   | `down/20260326000001_production_readiness.down.sql`                   |
| `20260326000002_add_transfer_recurring_to_transactions.sql` | `down/20260326000002_add_transfer_recurring_to_transactions.down.sql` |
| `20260326000003_add_rollover_to_budgets.sql`                | `down/20260326000003_add_rollover_to_budgets.down.sql`                |
| `20260326000004_add_account_status_to_goals.sql`            | `down/20260326000004_add_account_status_to_goals.down.sql`            |
| `20260326000005_standardize_owner_id.sql`                   | `down/20260326000005_standardize_owner_id.down.sql`                   |
| `20260326000006_sync_optimization.sql`                      | `down/20260326000006_sync_optimization.down.sql`                      |
| `20260327000001_launch_readiness_dashboard.sql`             | `down/20260327000001_launch_readiness_dashboard.down.sql`             |
| `20260327000002_bank_connections.sql`                       | `down/20260327000002_bank_connections.down.sql`                       |
| `20260327000003_spending_forecast.sql`                      | `down/20260327000003_spending_forecast.down.sql`                      |
| `20260327000004_anomaly_detection.sql`                      | `down/20260327000004_anomaly_detection.down.sql`                      |
| `20260328000001_family_plan_subscriptions.sql`              | `down/20260328000001_family_plan_subscriptions.down.sql`              |
| `20260328000002_recurring_idempotency.sql`                  | `down/20260328000002_recurring_idempotency.down.sql`                  |
| `20260328000003_notification_triggers.sql`                  | `down/20260328000003_notification_triggers.down.sql`                  |
| `20260328000004_referral_tracking.sql`                      | `down/20260328000004_referral_tracking.down.sql`                      |
| `20260328000005_report_generation.sql`                      | `down/20260328000005_report_generation.down.sql`                      |
| `20260328000006_exchange_rates.sql`                         | `down/20260328000006_exchange_rates.down.sql`                         |
| `20260328000007_bill_detection.sql`                         | `down/20260328000007_bill_detection.down.sql`                         |
| `20260328000008_data_import_pipeline.sql`                   | `down/20260328000008_data_import_pipeline.down.sql`                   |
| `20260329000001_gdpr_consent_capture.sql`                   | `down/20260329000001_gdpr_consent_capture.down.sql`                   |
| `20260329000002_crypto_shredding.sql`                       | `down/20260329000002_crypto_shredding.down.sql`                       |
| `20260329000003_rate_limit_enhancement.sql`                 | `down/20260329000003_rate_limit_enhancement.down.sql`                 |
| `20260329000004_webhook_security_hardening.sql`             | `down/20260329000004_webhook_security_hardening.down.sql`             |
| `20260330000001_investment_tables.sql`                      | `down/20260330000001_investment_tables.down.sql`                      |
| `20260330000002_exchange_rates_enhancements.sql`            | `down/20260330000002_exchange_rates_enhancements.down.sql`            |
| `20260330000003_bill_detection_enhancements.sql`            | `down/20260330000003_bill_detection_enhancements.down.sql`            |
| `20260330000004_report_generation_enhancements.sql`         | `down/20260330000004_report_generation_enhancements.down.sql`         |
| `20260330000005_audit_log_retention.sql`                    | `down/20260330000005_audit_log_retention.down.sql`                    |
| `20260330000006_enforce_owner_id_rls.sql`                   | `down/20260330000006_enforce_owner_id_rls.down.sql`                   |
| `20260330000007_transaction_pagination_index.sql`           | `down/20260330000007_transaction_pagination_index.down.sql`           |
| `20260331000001_bank_connectivity_foundation.sql`           | `down/20260331000001_bank_connectivity_foundation.down.sql`           |
| `20260331000002_add_mood_tag_to_transactions.sql`           | `down/20260331000002_add_mood_tag_to_transactions.down.sql`           |
| `20260331000003_recompute_account_balance_trigger.sql`      | `down/20260331000003_recompute_account_balance_trigger.down.sql`      |
| `20260331000004_privacy_trio_categories.sql`                | `down/20260331000004_privacy_trio_categories.down.sql`                |

## Timestamp Deduplication (#1323)

The following migrations were renamed to resolve duplicate timestamps:

| Original Name                                | New Name                                     | Reason                          |
| -------------------------------------------- | -------------------------------------------- | ------------------------------- |
| `20260316000001_fix_invitation_rls`          | `20260316000002_fix_invitation_rls`          | Collided with edge_fn_security  |
| `20260325000001_read_only_rate_limit_status` | `20260325000002_read_only_rate_limit_status` | Collided with enhanced_cleanup  |
| `20260328000001_recurring_idempotency`       | `20260328000002_recurring_idempotency`       | Collided with family_plan_subs  |
| `20260328000002_notification_triggers`       | `20260328000003_notification_triggers`       | Cascade from above              |
| `20260328000002_referral_tracking`           | `20260328000004_referral_tracking`           | Collided with notification_trig |
| `20260328000003_report_generation`           | `20260328000005_report_generation`           | Cascade from above              |
| `20260328000004_exchange_rates`              | `20260328000006_exchange_rates`              | Cascade from above              |
| `20260328000005_bill_detection`              | `20260328000007_bill_detection`              | Cascade from above              |
| `20260328000006_data_import_pipeline`        | `20260328000008_data_import_pipeline`        | Cascade from above              |

## Migration Version Deduplication (#2980)

The following migrations were renamed to resolve duplicate version prefixes that prevented the local Supabase stack from applying migrations (`supabase db reset` failed). Relative order was preserved; `audit_log_retention`, `add_mood_tag_to_transactions`, and `recompute_account_balance_trigger` kept their versions.

| Original Name                                 | New Name                                      | Reason                                       |
| --------------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| `20260330000005_enforce_owner_id_rls`         | `20260330000006_enforce_owner_id_rls`         | Collided with `audit_log_retention`          |
| `20260330000005_transaction_pagination_index` | `20260330000007_transaction_pagination_index` | Collided with `audit_log_retention`          |
| `20260331000002_privacy_trio_categories`      | `20260331000004_privacy_trio_categories`      | Collided with `add_mood_tag_to_transactions` |

Separately, `20260330000001_investment_tables.sql` had its entire body duplicated (a second verbatim copy in lines 178–318) which failed on the repeated `CREATE INDEX`; the duplicate block was removed.

## Safety Notes

- **ALWAYS** create a backup before running any down migration
- Down migrations that drop tables are **DESTRUCTIVE** and irreversible
- Review each down migration SQL before executing
- The initial schema down migration (`20260306000001`) should be run **last**
- RLS down migration (`20260306000002`) disables all security — only run during full teardown
- Some down migrations restore previous function versions (e.g., `handle_new_user_signup`)
