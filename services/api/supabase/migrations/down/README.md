# Reverse (Down) Migrations

**Issue:** #893

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
psql -f down/20260325000001_read_only_rate_limit_status.down.sql
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

| Up Migration                                      | Down Migration                                              |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `20260306000001_initial_schema.sql`               | `down/20260306000001_initial_schema.down.sql`               |
| `20260306000002_rls_policies.sql`                 | `down/20260306000002_rls_policies.down.sql`                 |
| `20260306000003_auth_config.sql`                  | `down/20260306000003_auth_config.down.sql`                  |
| `20260307000001_monitoring.sql`                   | `down/20260307000001_monitoring.down.sql`                   |
| `20260315000001_export_audit_log.sql`             | `down/20260315000001_export_audit_log.down.sql`             |
| `20260316000001_edge_function_security.sql`       | `down/20260316000001_edge_function_security.down.sql`       |
| `20260316000001_fix_invitation_rls.sql`           | `down/20260316000001_fix_invitation_rls.down.sql`           |
| `20260323000001_cleanup_and_balance_triggers.sql` | `down/20260323000001_cleanup_and_balance_triggers.down.sql` |
| `20260323000002_recurring_transactions.sql`       | `down/20260323000002_recurring_transactions.down.sql`       |
| `20260323000003_rate_limits.sql`                  | `down/20260323000003_rate_limits.down.sql`                  |
| `20260324000001_notification_infrastructure.sql`  | `down/20260324000001_notification_infrastructure.down.sql`  |
| `20260324000002_performance_indexes.sql`          | `down/20260324000002_performance_indexes.down.sql`          |
| `20260324000003_automated_maintenance.sql`        | `down/20260324000003_automated_maintenance.down.sql`        |
| `20260324000004_webhook_infrastructure.sql`       | `down/20260324000004_webhook_infrastructure.down.sql`       |
| `20260325000001_enhanced_cleanup_and_balance.sql` | `down/20260325000001_enhanced_cleanup_and_balance.down.sql` |
| `20260325000001_read_only_rate_limit_status.sql`  | `down/20260325000001_read_only_rate_limit_status.down.sql`  |

## Safety Notes

- **ALWAYS** create a backup before running any down migration
- Down migrations that drop tables are **DESTRUCTIVE** and irreversible
- Review each down migration SQL before executing
- The initial schema down migration (`20260306000001`) should be run **last**
- RLS down migration (`20260306000002`) disables all security — only run during full teardown
- Some down migrations restore previous function versions (e.g., `handle_new_user_signup`)
