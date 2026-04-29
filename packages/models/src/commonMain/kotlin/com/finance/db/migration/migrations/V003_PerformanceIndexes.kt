// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.migration.migrations

import com.finance.db.migration.Migration
import com.finance.db.migration.MigrationRegistry

val V003_PerformanceIndexes = Migration(
    version = 3,
    description = "Add composite indexes for common query patterns",
    up = listOf(
        """CREATE INDEX IF NOT EXISTS idx_transaction_account_date ON "transaction" (account_id, date DESC)""",
        """CREATE INDEX IF NOT EXISTS idx_transaction_household_date_type ON "transaction" (household_id, date, type)""",
        "CREATE INDEX IF NOT EXISTS idx_budget_household_period ON budget (household_id, period)",
        "CREATE INDEX IF NOT EXISTS idx_goal_household_status ON goal (household_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_category_household_income ON category (household_id, is_income)",
        "CREATE INDEX IF NOT EXISTS idx_account_household_active ON account (household_id, is_archived)",
    ),
    down = listOf(
        "DROP INDEX IF EXISTS idx_transaction_account_date",
        "DROP INDEX IF EXISTS idx_transaction_household_date_type",
        "DROP INDEX IF EXISTS idx_budget_household_period",
        "DROP INDEX IF EXISTS idx_goal_household_status",
        "DROP INDEX IF EXISTS idx_category_household_income",
        "DROP INDEX IF EXISTS idx_account_household_active",
    ),
)

internal fun registerV003() {
    MigrationRegistry.register(V003_PerformanceIndexes)
}
