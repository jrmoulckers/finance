// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.migration.migrations

import com.finance.db.migration.Migration
import com.finance.db.migration.MigrationRegistry

val V002_OwnerIdMigration = Migration(
    version = 2,
    description = "Add owner_id to financial entity tables for per-user data isolation",
    up = listOf(
        "ALTER TABLE account ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''",
        "CREATE INDEX IF NOT EXISTS idx_account_owner ON account (owner_id)",
        "ALTER TABLE \"transaction\" ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''",
        "CREATE INDEX IF NOT EXISTS idx_transaction_owner ON \"transaction\" (owner_id)",
        "ALTER TABLE budget ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''",
        "CREATE INDEX IF NOT EXISTS idx_budget_owner ON budget (owner_id)",
        "ALTER TABLE goal ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''",
        "CREATE INDEX IF NOT EXISTS idx_goal_owner ON goal (owner_id)",
        "ALTER TABLE category ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''",
        "CREATE INDEX IF NOT EXISTS idx_category_owner ON category (owner_id)",
    ),
    down = listOf(
        "DROP INDEX IF EXISTS idx_account_owner",
        "DROP INDEX IF EXISTS idx_transaction_owner",
        "DROP INDEX IF EXISTS idx_budget_owner",
        "DROP INDEX IF EXISTS idx_goal_owner",
        "DROP INDEX IF EXISTS idx_category_owner",
    ),
)

internal fun registerV002() {
    MigrationRegistry.register(V002_OwnerIdMigration)
}
